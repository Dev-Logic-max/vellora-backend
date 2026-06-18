import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import type {
  ApprovalStep,
  BlackoutDate,
  Holiday,
  LeaveBalance,
  LeaveRequest,
  LeaveType,
} from '../database/schema';
import { LeaveRepository } from './leave.repository';
import type {
  CreateBlackoutDto,
  CreateHolidayDto,
  CreateLeaveTypeDto,
  CreateRequestDto,
  DecisionDto,
  ListBalancesDto,
  ListHolidaysDto,
  ListRequestsDto,
  SetBalanceDto,
  UpdateLeaveTypeDto,
} from './dto/leave.dto';

/**
 * Tenant-scoped leave: requests → approval chain → balance decrement, plus
 * holiday/blackout calendars. Day counts exclude weekends + company holidays.
 * On top of RLS, area/store managers are limited to their own stores.
 */
@Injectable()
export class LeaveService {
  constructor(
    private readonly repo: LeaveRepository,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
  ) {}

  private scopedStoreIds(): string[] | null {
    const user = this.tenant.get()?.user;
    if (!user) return [];
    if (user.role === 'area_manager' || user.role === 'store_manager') return user.scopeIds ?? [];
    return null;
  }

  private currentUserId(): string | undefined {
    return this.tenant.get()?.user.userId;
  }

  private currentRole(): string | undefined {
    return this.tenant.get()?.user.role;
  }

  private isManager(): boolean {
    const role = this.currentRole();
    return role === 'owner' || role === 'hr' || role === 'area_manager' || role === 'store_manager';
  }

  // ── policies (leave types) ──────────────────────────────────────────────────
  listTypes(companyId: string): Promise<LeaveType[]> {
    return this.repo.listTypes(companyId);
  }

  createType(companyId: string, dto: CreateLeaveTypeDto): Promise<LeaveType> {
    return this.repo.createType(companyId, { companyId, ...dto });
  }

  async updateType(companyId: string, id: string, dto: UpdateLeaveTypeDto): Promise<LeaveType> {
    const existing = await this.repo.findType(companyId, id);
    if (!existing) throw new NotFoundException('Leave type not found.');
    return this.repo.updateType(companyId, id, dto);
  }

  // ── requests ────────────────────────────────────────────────────────────────
  listRequests(companyId: string, dto: ListRequestsDto): Promise<LeaveRequest[]> {
    const scope = this.scopedStoreIds();
    if (scope && scope.length === 0 && !dto.mine) return Promise.resolve([]);
    return this.repo.listRequests(companyId, dto, dto.mine ? null : scope);
  }

  async getRequest(companyId: string, id: string): Promise<LeaveRequest> {
    const req = await this.repo.findRequest(companyId, id);
    if (!req) throw new NotFoundException('Leave request not found.');
    return req;
  }

  /** Request → compute days (excl. weekends/holidays), reserve pending balance. */
  async createRequest(companyId: string, dto: CreateRequestDto): Promise<LeaveRequest> {
    const type = await this.repo.findType(companyId, dto.typeId);
    if (!type) throw new NotFoundException('Leave type not found.');

    const holidays = await this.repo.holidaysInRange(companyId, dto.startDate, dto.endDate);
    const blackouts = await this.repo.blackoutsInRange(companyId, dto.startDate, dto.endDate);
    if (blackouts.length) {
      throw new ConflictException('Requested dates fall within a blackout period.');
    }

    let days = countLeaveDays(dto.startDate, dto.endDate, holidays);
    if (dto.halfDay) days = 0.5;
    if (days <= 0) throw new BadRequestException('Selected range contains no working days.');

    const year = Number(dto.startDate.slice(0, 4));
    const chain = this.buildChain(type);

    const req = await this.repo.createRequest(companyId, {
      companyId,
      employeeId: dto.employeeId,
      typeId: dto.typeId,
      startDate: dto.startDate,
      endDate: dto.endDate,
      halfDay: dto.halfDay ?? false,
      days: String(days),
      reason: dto.reason,
      status: 'requested',
      approverChain: chain,
      currentStep: 0,
    });

    await this.adjustBalance(companyId, dto.employeeId, dto.typeId, year, { pending: days });
    return req;
  }

  /** Conflicts shown to an approver: other people off in the same window. */
  async conflicts(companyId: string, id: string) {
    const req = await this.getRequest(companyId, id);
    const overlapping = await this.repo.overlappingRequests(
      companyId,
      req.startDate,
      req.endDate,
      id,
    );
    return {
      alreadyOff: overlapping.length,
      requests: overlapping.map((r) => ({
        id: r.id,
        employeeId: r.employeeId,
        employee: (r as LeaveRequest & { employee?: unknown }).employee,
        startDate: r.startDate,
        endDate: r.endDate,
        status: r.status,
      })),
    };
  }

  async approve(companyId: string, id: string, dto: DecisionDto): Promise<LeaveRequest> {
    const req = await this.getRequest(companyId, id);
    this.assertCanApprove();
    if (req.status !== 'requested') throw new ConflictException('Request is not pending approval.');

    const chain = (req.approverChain as ApprovalStep[]) ?? [];
    const step = chain[req.currentStep];
    if (step) {
      step.status = 'approved';
      step.by = this.currentUserId();
      step.at = new Date().toISOString();
      step.note = dto.note;
    }

    const nextStep = req.currentStep + 1;
    const final = nextStep >= chain.length;
    const updated = await this.repo.updateRequest(companyId, id, {
      approverChain: chain,
      currentStep: nextStep,
      status: final ? 'approved' : 'requested',
    });

    if (final) {
      const year = Number(req.startDate.slice(0, 4));
      const days = Number(req.days);
      await this.adjustBalance(companyId, req.employeeId, req.typeId, year, {
        pending: -days,
        taken: days,
      });
      await this.audit.log({
        companyId,
        actorUserId: this.currentUserId(),
        action: 'leave.request.approved',
        resource: 'leave_request',
        targetId: id,
        meta: { days, typeId: req.typeId },
      });
    }
    return updated;
  }

  async reject(companyId: string, id: string, dto: DecisionDto): Promise<LeaveRequest> {
    const req = await this.getRequest(companyId, id);
    this.assertCanApprove();
    if (req.status !== 'requested') throw new ConflictException('Request is not pending approval.');

    const chain = (req.approverChain as ApprovalStep[]) ?? [];
    const step = chain[req.currentStep];
    if (step) {
      step.status = 'rejected';
      step.by = this.currentUserId();
      step.at = new Date().toISOString();
      step.note = dto.note;
    }
    const year = Number(req.startDate.slice(0, 4));
    await this.adjustBalance(companyId, req.employeeId, req.typeId, year, {
      pending: -Number(req.days),
    });
    return this.repo.updateRequest(companyId, id, {
      approverChain: chain,
      status: 'rejected',
    });
  }

  async cancel(companyId: string, id: string): Promise<LeaveRequest> {
    const req = await this.getRequest(companyId, id);
    if (req.status === 'rejected' || req.status === 'cancelled') {
      throw new ConflictException('Request is already closed.');
    }
    const year = Number(req.startDate.slice(0, 4));
    const days = Number(req.days);
    await this.adjustBalance(companyId, req.employeeId, req.typeId, year, {
      pending: req.status === 'requested' ? -days : 0,
      taken: req.status === 'approved' ? -days : 0,
    });
    return this.repo.updateRequest(companyId, id, { status: 'cancelled' });
  }

  // ── balances ────────────────────────────────────────────────────────────────
  listBalances(companyId: string, dto: ListBalancesDto): Promise<LeaveBalance[]> {
    return this.repo.listBalances(companyId, {
      employeeId: dto.employeeId,
      year: dto.year ?? new Date().getUTCFullYear(),
    });
  }

  setBalance(companyId: string, dto: SetBalanceDto): Promise<LeaveBalance> {
    return this.repo.upsertBalance(companyId, {
      companyId,
      employeeId: dto.employeeId,
      typeId: dto.typeId,
      year: dto.year,
      entitled: String(dto.entitled),
    });
  }

  private async adjustBalance(
    companyId: string,
    employeeId: string,
    typeId: string,
    year: number,
    delta: { entitled?: number; taken?: number; pending?: number },
  ): Promise<void> {
    const existing = await this.repo.findBalance(companyId, employeeId, typeId, year);
    if (!existing) {
      await this.repo.upsertBalance(companyId, {
        companyId,
        employeeId,
        typeId,
        year,
        entitled: String(delta.entitled ?? 0),
        taken: String(Math.max(0, delta.taken ?? 0)),
        pending: String(Math.max(0, delta.pending ?? 0)),
      });
      return;
    }
    await this.repo.updateBalance(companyId, existing.id, {
      taken: String(Math.max(0, Number(existing.taken) + (delta.taken ?? 0))),
      pending: String(Math.max(0, Number(existing.pending) + (delta.pending ?? 0))),
    });
  }

  /**
   * Year-end accrual + carryover (06-leave-holidays §10). Rolls remaining into
   * next year per each type's carryover rule. Driven by a BullMQ cron in prod.
   * TODO(Phase 7): wire as a repeatable BullMQ job; for now callable manually.
   */
  async runYearEnd(companyId: string, fromYear: number): Promise<{ rolled: number }> {
    const balances = await this.repo.listBalances(companyId, { year: fromYear });
    const types = await this.repo.listTypes(companyId);
    let rolled = 0;
    for (const b of balances) {
      const type = types.find((t) => t.id === b.typeId);
      const cap = (type?.carryoverRule as { maxDays?: number })?.maxDays ?? 0;
      const remaining = Number(b.entitled) - Number(b.taken);
      const carry = Math.min(Math.max(0, remaining), cap);
      const accrual = (type?.accrualRule as { perYear?: number })?.perYear ?? Number(b.entitled);
      await this.repo.upsertBalance(companyId, {
        companyId,
        employeeId: b.employeeId,
        typeId: b.typeId,
        year: fromYear + 1,
        entitled: String(accrual + carry),
      });
      rolled += 1;
    }
    return { rolled };
  }

  // ── holidays + blackout ─────────────────────────────────────────────────────
  listHolidays(companyId: string, dto: ListHolidaysDto): Promise<Holiday[]> {
    return this.repo.listHolidays(companyId, { storeId: dto.storeId });
  }

  createHoliday(companyId: string, dto: CreateHolidayDto): Promise<Holiday> {
    return this.repo.createHoliday(companyId, { companyId, ...dto });
  }

  async deleteHoliday(companyId: string, id: string): Promise<{ ok: true }> {
    await this.repo.deleteHoliday(companyId, id);
    return { ok: true };
  }

  listBlackouts(companyId: string): Promise<BlackoutDate[]> {
    return this.repo.listBlackouts(companyId);
  }

  createBlackout(companyId: string, dto: CreateBlackoutDto): Promise<BlackoutDate> {
    return this.repo.createBlackout(companyId, { companyId, ...dto });
  }

  // ── helpers ─────────────────────────────────────────────────────────────────
  private assertCanApprove(): void {
    if (!this.isManager()) throw new ForbiddenException('Only managers can approve leave.');
  }

  /** Single-approver (free) or a multi-step chain (paid types). */
  private buildChain(type: LeaveType): ApprovalStep[] {
    if (type.requiresChain) {
      return [
        { step: 0, role: 'store_manager', status: 'pending' },
        { step: 1, role: 'hr', status: 'pending' },
      ];
    }
    return [{ step: 0, role: 'store_manager', status: 'pending' }];
  }
}

/** Working days in [start,end] inclusive, excluding Sat/Sun + holiday dates. */
function countLeaveDays(start: string, end: string, holidays: Holiday[]): number {
  const holidaySet = new Set(holidays.map((h) => h.date));
  let count = 0;
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last) {
    const day = cursor.getUTCDay();
    const iso = cursor.toISOString().slice(0, 10);
    if (day !== 0 && day !== 6 && !holidaySet.has(iso)) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}
