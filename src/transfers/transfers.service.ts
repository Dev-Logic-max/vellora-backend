import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import type { Transfer } from '../database/schema';
import type { CreateTransferDto, ListTransfersDto } from './dto/transfer.dto';
import { TransfersRepository } from './transfers.repository';

/**
 * Tenant-scoped store transfers (12-transfers). Temporary transfers create a
 * guest employee_stores link for the window and auto-revert at the end; permanent
 * ones update the primary store. RLS + store-scope on top.
 */
@Injectable()
export class TransfersService {
  constructor(
    private readonly repo: TransfersRepository,
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

  private assertStoreInScope(storeId: string | null | undefined): void {
    const ids = this.scopedStoreIds();
    if (ids && (!storeId || !ids.includes(storeId))) {
      throw new ForbiddenException('That store is outside your scope.');
    }
  }

  list(companyId: string, dto: ListTransfersDto): Promise<Transfer[]> {
    const scope = this.scopedStoreIds();
    return this.repo
      .list(companyId, dto)
      .then((rows) =>
        scope
          ? rows.filter(
              (r) =>
                (r.fromStoreId && scope.includes(r.fromStoreId)) || scope.includes(r.toStoreId),
            )
          : rows,
      );
  }

  async get(companyId: string, id: string): Promise<Transfer> {
    const t = await this.repo.find(companyId, id);
    if (!t) throw new NotFoundException('Transfer not found.');
    return t;
  }

  async create(companyId: string, dto: CreateTransferDto): Promise<Transfer> {
    const employee = await this.repo.findEmployee(companyId, dto.employeeId);
    if (!employee) throw new NotFoundException('Employee not found.');
    const fromStoreId = dto.fromStoreId ?? employee.primaryStoreId ?? null;
    if (dto.toStoreId === fromStoreId) {
      throw new ConflictException('Destination store equals the current store.');
    }
    this.assertStoreInScope(dto.toStoreId);
    return this.repo.create(companyId, {
      companyId,
      employeeId: dto.employeeId,
      fromStoreId,
      toStoreId: dto.toStoreId,
      kind: dto.kind,
      startDate: dto.startDate,
      endDate: dto.endDate,
      reason: dto.reason,
      status: 'requested',
      requestedBy: this.currentUserId(),
    });
  }

  /** Approve → activate immediately (or wait for start date on temp transfers). */
  async approve(companyId: string, id: string): Promise<Transfer> {
    const t = await this.get(companyId, id);
    if (t.status !== 'requested') throw new ConflictException('Transfer is not pending.');
    this.assertStoreInScope(t.toStoreId);

    const today = new Date().toISOString().slice(0, 10);
    const startNow = t.kind === 'permanent' || !t.startDate || t.startDate <= today;

    if (t.kind === 'permanent') {
      await this.repo.setPrimaryStore(companyId, t.employeeId, t.toStoreId);
      const done = await this.repo.update(companyId, id, {
        status: 'completed',
        approvedBy: this.currentUserId(),
      });
      await this.auditTransfer(companyId, id, 'approved_permanent');
      return done;
    }

    // Temporary: activate now or leave approved for the BullMQ activator.
    if (startNow) {
      const link = await this.repo.addLink(companyId, {
        companyId,
        employeeId: t.employeeId,
        storeId: t.toStoreId,
        relation: 'guest',
        active: true,
      });
      const active = await this.repo.update(companyId, id, {
        status: 'active',
        linkId: link.id,
        approvedBy: this.currentUserId(),
      });
      await this.auditTransfer(companyId, id, 'activated');
      return active;
    }
    const approved = await this.repo.update(companyId, id, {
      status: 'approved',
      approvedBy: this.currentUserId(),
    });
    await this.auditTransfer(companyId, id, 'approved');
    return approved;
  }

  async reject(companyId: string, id: string): Promise<Transfer> {
    const t = await this.get(companyId, id);
    if (t.status !== 'requested') throw new ConflictException('Transfer is not pending.');
    return this.repo.update(companyId, id, {
      status: 'rejected',
      approvedBy: this.currentUserId(),
    });
  }

  async cancel(companyId: string, id: string): Promise<Transfer> {
    const t = await this.get(companyId, id);
    if (t.status === 'completed' || t.status === 'cancelled') {
      throw new ConflictException('Transfer is already closed.');
    }
    if (t.status === 'active' && t.linkId) await this.repo.removeLink(companyId, t.linkId);
    return this.repo.update(companyId, id, { status: 'cancelled', linkId: null });
  }

  /**
   * BullMQ-driven sweep (12-transfers §10): activate approved temp transfers whose
   * window started, and revert active ones whose window ended. Callable manually
   * until the repeatable job is wired. TODO(Phase 7): schedule daily.
   */
  async runScheduledSweep(companyId: string): Promise<{ activated: number; reverted: number }> {
    const today = new Date().toISOString().slice(0, 10);
    let activated = 0;
    let reverted = 0;

    for (const t of await this.repo.dueToActivate(companyId, today)) {
      const link = await this.repo.addLink(companyId, {
        companyId,
        employeeId: t.employeeId,
        storeId: t.toStoreId,
        relation: 'guest',
        active: true,
      });
      await this.repo.update(companyId, t.id, { status: 'active', linkId: link.id });
      activated += 1;
    }

    for (const t of await this.repo.dueToRevert(companyId, today)) {
      if (t.linkId) await this.repo.removeLink(companyId, t.linkId);
      await this.repo.update(companyId, t.id, { status: 'completed', linkId: null });
      reverted += 1;
    }
    return { activated, reverted };
  }

  private auditTransfer(companyId: string, id: string, action: string): Promise<void> {
    return this.audit.log({
      companyId,
      actorUserId: this.currentUserId(),
      action: `transfer.${action}`,
      resource: 'transfer',
      targetId: id,
    });
  }
}
