import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import type { Anomaly, AttendanceLog, Correction, NewAnomaly } from '../database/schema';
import { DeviceRegistrationService } from '../devices/device-registration.service';
import { DevicesService } from '../devices/devices.service';
import { AttendanceRepository } from './attendance.repository';
import type {
  ClockInDto,
  CreateCorrectionDto,
  KioskPunchDto,
  ListLogsDto,
  PunchDto,
  ResolveAnomalyDto,
  SyncBatchDto,
} from './dto/attendance.dto';

/** Minutes a punch may slip before it counts as late / early-leave. */
const GRACE_MINUTES = 5;
/** Worked minutes beyond the scheduled shift (or 12h when unscheduled) → over-hours. */
const OVER_HOURS_SLACK_MIN = 60;
const UNSCHEDULED_CAP_MIN = 12 * 60;

interface SyncEvent {
  kind: 'clock_in' | 'clock_out' | 'break_start' | 'break_end';
  employeeId: string;
  storeId?: string;
  shiftId?: string;
  method?: 'qr' | 'manual' | 'terminal';
  terminalId?: string;
  deviceId?: string;
  atUtc: Date;
  paid?: boolean;
}

/**
 * Tenant-scoped attendance capture + anomaly detection. On top of RLS, reads
 * are narrowed by the caller's store scope (owner/HR all; area/store managers
 * their stores). All times are UTC; the frontend renders them in store tz.
 */
@Injectable()
export class AttendanceService {
  constructor(
    private readonly repo: AttendanceRepository,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
    private readonly devices: DevicesService,
    private readonly deviceRegistrations: DeviceRegistrationService,
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

  private assertStoreInScope(storeId: string): void {
    const ids = this.scopedStoreIds();
    if (ids && !ids.includes(storeId)) {
      throw new ForbiddenException('That store is outside your scope.');
    }
  }

  /** Timesheet CSV (paid). Worked minutes net of unpaid breaks. */
  async exportCsv(companyId: string, dto: ListLogsDto): Promise<string> {
    const logs = await this.listLogs(companyId, dto);
    const header = 'employee,clock_in_utc,clock_out_utc,worked_minutes,method,status';
    const rows = logs.map((l) => {
      const name = (l as LogWithEmployee).employee
        ? `${(l as LogWithEmployee).employee!.firstName} ${(l as LogWithEmployee).employee!.lastName}`
        : l.employeeId;
      const worked = l.clockOutUtc ? Math.round(minutesBetween(l.clockInUtc, l.clockOutUtc)) : '';
      return [
        csvCell(name),
        l.clockInUtc.toISOString(),
        l.clockOutUtc ? l.clockOutUtc.toISOString() : '',
        worked,
        l.method,
        l.status,
      ].join(',');
    });
    return [header, ...rows].join('\n');
  }

  // ── reads ────────────────────────────────────────────────────────────────
  async listLogs(companyId: string, dto: ListLogsDto): Promise<AttendanceLog[]> {
    const scope = this.scopedStoreIds();
    if (scope && scope.length === 0) return [];
    const logs = await this.repo.listLogs(companyId, dto, scope);
    return this.withMembershipRole(companyId, logs);
  }

  /** Attaches each employee's company membership role (the staff "user role")
   * to the log's employee embed, in one batched lookup. */
  private async withMembershipRole<T extends LogWithEmployee>(
    companyId: string,
    logs: T[],
  ): Promise<T[]> {
    const userIds = logs.map((l) => l.employee?.userId).filter((id): id is string => Boolean(id));
    if (userIds.length === 0) return logs;
    const roles = await this.repo.membershipRolesByUser(companyId, userIds);
    for (const log of logs) {
      if (log.employee?.userId) {
        log.employee.membershipRole = roles.get(log.employee.userId) ?? null;
      }
    }
    return logs;
  }

  async getLog(companyId: string, id: string): Promise<AttendanceLog> {
    const log = await this.repo.findLogById(companyId, id);
    if (!log) throw new NotFoundException('Attendance log not found.');
    this.assertStoreInScope(log.storeId);
    return log;
  }

  /** Delete an attendance log (manager action, audited). Cascades its breaks. */
  async deleteLog(companyId: string, id: string): Promise<{ id: string }> {
    const log = await this.getLog(companyId, id);
    await this.repo.deleteLog(companyId, id);
    await this.audit.log({
      companyId,
      actorUserId: this.currentUserId(),
      action: 'attendance.log.deleted',
      resource: 'attendance_log',
      targetId: id,
      meta: { employeeId: log.employeeId, storeId: log.storeId },
    });
    return { id };
  }

  // ── clock in / out + breaks ───────────────────────────────────────────────
  async clockIn(companyId: string, dto: ClockInDto): Promise<AttendanceLog> {
    this.assertStoreInScope(dto.storeId);
    const open = await this.repo.findOpenLog(companyId, dto.employeeId);
    if (open) throw new ConflictException('Employee is already clocked in.');

    const at = dto.atUtc ?? new Date();
    const shift =
      dto.shiftId !== undefined
        ? await this.repo.shiftById(companyId, dto.shiftId)
        : await this.repo.findScheduledShift(companyId, dto.employeeId, at);

    const log = await this.repo.createLog(companyId, {
      companyId,
      storeId: dto.storeId,
      employeeId: dto.employeeId,
      shiftId: shift?.id ?? null,
      clockInUtc: at,
      method: dto.method ?? 'manual',
      deviceId: dto.deviceId,
      terminalId: dto.terminalId,
      lat: dto.lat,
      lng: dto.lng,
      source: 'online',
      status: 'open',
      notes: dto.notes,
    });

    // Late punch vs scheduled start.
    if (shift && minutesBetween(shift.startsAtUtc, at) > GRACE_MINUTES) {
      await this.raiseAnomaly(companyId, log, 'late', minutesBetween(shift.startsAtUtc, at));
    }
    return log;
  }

  async clockOut(companyId: string, dto: PunchDto): Promise<AttendanceLog> {
    const log = await this.resolveOpenLog(companyId, dto);
    const at = dto.atUtc ?? new Date();
    if (at <= log.clockInUtc) throw new ConflictException('Clock-out must be after clock-in.');

    // Close any dangling break first.
    const openBreak = await this.repo.findOpenBreak(companyId, log.id);
    if (openBreak) {
      await this.repo.updateBreak(companyId, openBreak.id, {
        endUtc: at,
        minutes: minutesBetween(openBreak.startUtc, at),
      });
    }

    const closed = await this.repo.updateLog(companyId, log.id, {
      clockOutUtc: at,
      status: 'closed',
    });
    await this.detectOnClose(companyId, closed);
    // TODO(Phase 6/7): emit a Socket.IO event to the store room for the live feed.
    return closed;
  }

  async breakStart(companyId: string, dto: PunchDto) {
    const log = await this.resolveOpenLog(companyId, dto);
    const existing = await this.repo.findOpenBreak(companyId, log.id);
    if (existing) throw new ConflictException('A break is already in progress.');
    return this.repo.createBreak(companyId, {
      companyId,
      logId: log.id,
      startUtc: dto.atUtc ?? new Date(),
      paid: dto.paid ?? false,
    });
  }

  async breakEnd(companyId: string, dto: PunchDto) {
    const log = await this.resolveOpenLog(companyId, dto);
    const open = await this.repo.findOpenBreak(companyId, log.id);
    if (!open) throw new ConflictException('No break is in progress.');
    const at = dto.atUtc ?? new Date();
    return this.repo.updateBreak(companyId, open.id, {
      endUtc: at,
      minutes: minutesBetween(open.startUtc, at),
    });
  }

  /** Offline batch flush — events are applied in chronological order. */
  async sync(companyId: string, dto: SyncBatchDto) {
    const events = [...(dto.events as SyncEvent[])].sort(
      (a, b) => a.atUtc.getTime() - b.atUtc.getTime(),
    );
    let applied = 0;
    const errors: { index: number; message: string }[] = [];
    for (const [index, ev] of events.entries()) {
      try {
        if (ev.kind === 'clock_in') {
          if (!ev.storeId) throw new ConflictException('storeId required for clock_in.');
          await this.clockIn(companyId, {
            employeeId: ev.employeeId,
            storeId: ev.storeId,
            shiftId: ev.shiftId,
            method: ev.method,
            terminalId: ev.terminalId,
            deviceId: ev.deviceId,
            atUtc: ev.atUtc,
          });
          // Mark the freshly created log as an offline-sync source.
          const open = await this.repo.findOpenLog(companyId, ev.employeeId);
          if (open) await this.repo.updateLog(companyId, open.id, { source: 'offline_sync' });
        } else if (ev.kind === 'clock_out') {
          await this.clockOut(companyId, {
            employeeId: ev.employeeId,
            atUtc: ev.atUtc,
          });
        } else if (ev.kind === 'break_start') {
          await this.breakStart(companyId, {
            employeeId: ev.employeeId,
            atUtc: ev.atUtc,
            paid: ev.paid,
          });
        } else {
          await this.breakEnd(companyId, {
            employeeId: ev.employeeId,
            atUtc: ev.atUtc,
          });
        }
        applied += 1;
      } catch (e) {
        errors.push({ index, message: e instanceof Error ? e.message : 'sync event failed' });
      }
    }
    return { applied, failed: errors.length, errors };
  }

  /**
   * QR-scan punch (point 19). The signed-in employee scanned a terminal QR:
   *  1. validate the QR token (active terminal, current secret, within TTL),
   *  2. resolve THIS employee from the auth token (never the client),
   *  3. enforce the device gate (must be registered; fingerprint if company-on),
   *  4. perform the action, stamped with method=qr + terminal/store.
   * Any expired/invalid QR or unregistered device is rejected with a clear error.
   */
  async kioskPunch(companyId: string, dto: KioskPunchDto) {
    const terminal = await this.devices.validateQrToken(companyId, dto.token);

    const userId = this.tenant.get()?.user.userId;
    const employee = userId ? await this.repo.employeeByUserId(companyId, userId) : null;
    if (!employee) {
      throw new ForbiddenException('Only employees can clock in. No employee profile is linked.');
    }

    // Device gate — registered (+ optional fingerprint) required for ANY action.
    await this.deviceRegistrations.assertCanClockIn(companyId, employee.id, {
      deviceToken: dto.deviceToken,
      fingerprint: dto.fingerprint,
    });

    const at = new Date();
    if (dto.action === 'clock_in') {
      return this.clockIn(companyId, {
        employeeId: employee.id,
        storeId: terminal.storeId,
        method: 'qr',
        terminalId: terminal.id,
        atUtc: at,
      });
    }
    if (dto.action === 'clock_out') {
      return this.clockOut(companyId, { employeeId: employee.id, atUtc: at });
    }
    if (dto.action === 'break_start') {
      return this.breakStart(companyId, { employeeId: employee.id, atUtc: at });
    }
    return this.breakEnd(companyId, { employeeId: employee.id, atUtc: at });
  }

  private async resolveOpenLog(companyId: string, dto: PunchDto): Promise<AttendanceLog> {
    if (dto.logId) return this.getLog(companyId, dto.logId);
    if (!dto.employeeId) throw new ConflictException('logId or employeeId is required.');
    const open = await this.repo.findOpenLog(companyId, dto.employeeId);
    if (!open) throw new NotFoundException('No open attendance log for this employee.');
    this.assertStoreInScope(open.storeId);
    return open;
  }

  // ── anomaly detection ─────────────────────────────────────────────────────
  private async raiseAnomaly(
    companyId: string,
    log: AttendanceLog,
    type: NewAnomaly['type'],
    deltaMinutes: number,
  ): Promise<void> {
    const severity = deltaMinutes > 60 ? 'high' : deltaMinutes > 20 ? 'medium' : 'low';
    await this.repo.createAnomaly(companyId, {
      companyId,
      storeId: log.storeId,
      employeeId: log.employeeId,
      logId: log.id,
      type,
      severity,
      status: 'open',
      note: `${type.replace(/_/g, ' ')} by ~${Math.round(deltaMinutes)} min`,
    });
    if (log.status === 'open' || log.status === 'closed') {
      await this.repo.updateLog(companyId, log.id, { status: 'flagged' });
    }
  }

  /** Early-leave + over-hours rules, evaluated when a log is closed. */
  private async detectOnClose(companyId: string, log: AttendanceLog): Promise<void> {
    if (!log.clockOutUtc) return;
    const worked = minutesBetween(log.clockInUtc, log.clockOutUtc);
    const shift = log.shiftId ? await this.repo.shiftById(companyId, log.shiftId) : null;

    if (shift) {
      const early = minutesBetween(log.clockOutUtc, shift.endsAtUtc);
      if (early > GRACE_MINUTES) await this.raiseAnomaly(companyId, log, 'early_leave', early);
      const scheduled =
        minutesBetween(shift.startsAtUtc, shift.endsAtUtc) - (shift.breakMinutes ?? 0);
      if (worked > scheduled + OVER_HOURS_SLACK_MIN) {
        await this.raiseAnomaly(companyId, log, 'over_hours', worked - scheduled);
      }
    } else if (worked > UNSCHEDULED_CAP_MIN) {
      await this.raiseAnomaly(companyId, log, 'over_hours', worked - UNSCHEDULED_CAP_MIN);
    }
    // TODO(Phase 6): nightly BullMQ sweep for missing_punch / no_show across stores;
    // location_mismatch when store coordinates are configured (paid).
  }

  listAnomalies(companyId: string, status?: Anomaly['status']): Promise<Anomaly[]> {
    const scope = this.scopedStoreIds();
    if (scope && scope.length === 0) return Promise.resolve([]);
    return this.repo.listAnomalies(companyId, scope, status);
  }

  async resolveAnomaly(companyId: string, id: string, dto: ResolveAnomalyDto): Promise<Anomaly> {
    const anomaly = await this.repo.findAnomaly(companyId, id);
    if (!anomaly) throw new NotFoundException('Anomaly not found.');
    this.assertStoreInScope(anomaly.storeId);
    return this.repo.updateAnomaly(companyId, id, {
      status: dto.status ?? 'resolved',
      note: dto.note ?? anomaly.note,
      resolvedBy: this.currentUserId(),
    });
  }

  // ── corrections workflow ──────────────────────────────────────────────────
  async requestCorrection(
    companyId: string,
    logId: string,
    dto: CreateCorrectionDto,
  ): Promise<Correction> {
    const log = await this.getLog(companyId, logId);
    const oldValue = correctionFieldValue(log, dto.field);
    return this.repo.createCorrection(companyId, {
      companyId,
      logId,
      field: dto.field,
      oldValue,
      newValue: dto.newValue,
      reason: dto.reason,
      requestedBy: this.currentUserId(),
      status: 'requested',
    });
  }

  listCorrections(companyId: string, status?: Correction['status']): Promise<Correction[]> {
    return this.repo.listCorrections(companyId, status);
  }

  async approveCorrection(companyId: string, id: string): Promise<Correction> {
    const correction = await this.repo.findCorrection(companyId, id);
    if (!correction) throw new NotFoundException('Correction not found.');
    if (correction.status !== 'requested') {
      throw new ConflictException('Correction has already been resolved.');
    }
    const log = await this.getLog(companyId, correction.logId);
    await this.applyCorrection(companyId, log, correction.field, correction.newValue);
    const resolved = await this.repo.updateCorrection(companyId, id, {
      status: 'approved',
      approvedBy: this.currentUserId(),
      resolvedAt: new Date(),
    });
    await this.audit.log({
      companyId,
      actorUserId: this.currentUserId(),
      action: 'attendance.correction.approved',
      resource: 'attendance_log',
      targetId: log.id,
      meta: { field: correction.field, from: correction.oldValue, to: correction.newValue },
    });
    return resolved;
  }

  async rejectCorrection(companyId: string, id: string): Promise<Correction> {
    const correction = await this.repo.findCorrection(companyId, id);
    if (!correction) throw new NotFoundException('Correction not found.');
    if (correction.status !== 'requested') {
      throw new ConflictException('Correction has already been resolved.');
    }
    await this.getLog(companyId, correction.logId); // scope check
    return this.repo.updateCorrection(companyId, id, {
      status: 'rejected',
      approvedBy: this.currentUserId(),
      resolvedAt: new Date(),
    });
  }

  private async applyCorrection(
    companyId: string,
    log: AttendanceLog,
    field: string,
    newValue: string | null,
  ): Promise<void> {
    const patch: Record<string, unknown> = { status: 'corrected' };
    if (field === 'clock_in_utc' && newValue) patch.clockInUtc = new Date(newValue);
    else if (field === 'clock_out_utc' && newValue) patch.clockOutUtc = new Date(newValue);
    else if (field === 'status' && newValue) patch.status = newValue;
    await this.repo.updateLog(companyId, log.id, patch);
  }
}

type LogWithEmployee = AttendanceLog & {
  employee?: {
    firstName: string;
    lastName: string;
    userId?: string | null;
    membershipRole?: string | null;
  } | null;
};

function minutesBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 60_000;
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function correctionFieldValue(log: AttendanceLog, field: string): string | null {
  if (field === 'clock_in_utc') return log.clockInUtc.toISOString();
  if (field === 'clock_out_utc') return log.clockOutUtc ? log.clockOutUtc.toISOString() : null;
  if (field === 'status') return log.status;
  return null;
}
