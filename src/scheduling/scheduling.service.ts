import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import type { NewShift, Shift } from '../database/schema';
import { SchedulingRepository, type ShiftFilters } from './scheduling.repository';
import type {
  ApplyTemplateDto,
  AssignShiftDto,
  CopyWeekDto,
  CoverageQueryDto,
  CreateShiftDto,
  CreateTemplateDto,
  ListShiftsDto,
  PublishShiftsDto,
  SetCoverageTargetsDto,
  UpdateShiftDto,
} from './dto/shift.dto';

const DAY_MS = 86_400_000;
const MAX_WEEK_MINUTES = 60 * 60; // generous weekly cap before over-hours blocks
const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

interface TemplateBlock {
  start: string; // "HH:MM"
  end: string; // "HH:MM"
  role?: string;
  breakMinutes?: number;
}

function utcAt(ymd: string, hhmm = '00:00'): Date {
  return new Date(`${ymd}T${hhmm}:00.000Z`);
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}
function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
/** 0 = Monday … 6 = Sunday (matches coverage_targets.weekday). */
function weekdayMon0(d: Date): number {
  return (d.getUTCDay() + 6) % 7;
}
function startOfWeekUtc(d: Date): Date {
  const monday = addDays(d, -weekdayMon0(d));
  return utcAt(dayKey(monday));
}
function durationMinutes(s: Shift): number {
  const gross = (s.endsAtUtc.getTime() - s.startsAtUtc.getTime()) / 60_000;
  return Math.max(0, gross - (s.breakMinutes ?? 0));
}

/** The yyyy-MM-dd calendar date of a UTC instant as seen in `tz`. */
function localDateKey(instant: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz || 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/**
 * A wide UTC window (±1 day) guaranteed to contain the store-local calendar day
 * of `instant`. The caller fetches candidate shifts in this window cheaply, then
 * narrows precisely by the local date key — used to enforce "one shift per
 * employee per date".
 */
function localDayUtcWindow(instant: Date): { start: Date; end: Date } {
  return {
    start: new Date(instant.getTime() - DAY_MS),
    end: new Date(instant.getTime() + DAY_MS),
  };
}

/**
 * Tenant-scoped shift scheduling. On top of RLS, reads/writes are narrowed by
 * the caller's store scope (owner/HR all; area/store managers their stores).
 * All times are UTC; the frontend renders them in the store timezone.
 */
@Injectable()
export class SchedulingService {
  private readonly logger = new Logger(SchedulingService.name);

  constructor(
    private readonly repo: SchedulingRepository,
    private readonly tenant: TenantContextService,
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

  list(companyId: string, dto: ListShiftsDto): Promise<Shift[]> {
    const scope = this.scopedStoreIds();
    if (scope && scope.length === 0) return Promise.resolve([]);
    const filters: ShiftFilters = { ...dto };
    return this.repo.list(companyId, filters, scope);
  }

  async get(companyId: string, id: string) {
    const shift = await this.repo.findById(companyId, id);
    if (!shift) throw new NotFoundException('Shift not found.');
    this.assertStoreInScope(shift.storeId);
    return shift;
  }

  /** Enforces single-shift-per-date, double-booking, on-leave, over-hours and
   * store-capacity guards. */
  private async assertNoConflicts(
    companyId: string,
    employeeId: string,
    storeId: string,
    starts: Date,
    ends: Date,
    excludeId?: string,
  ): Promise<void> {
    // One shift per employee per store-local date (point 8). Resolve the store's
    // timezone, then reject if another committed shift already exists that day.
    const store = await this.repo.storeById(companyId, storeId);
    const tz = store?.timezone ?? 'UTC';
    const targetDay = localDateKey(starts, tz);
    const { start: dayStart, end: dayEnd } = localDayUtcWindow(starts);
    const sameDay = await this.repo.employeeShiftsOnDay(
      companyId,
      employeeId,
      dayStart,
      dayEnd,
      excludeId,
    );
    if (sameDay.some((s) => localDateKey(s.startsAtUtc, tz) === targetDay)) {
      throw new ConflictException(
        'This employee already has a shift on this date — only one shift per day is allowed.',
      );
    }

    const overlaps = await this.repo.findEmployeeOverlaps(
      companyId,
      employeeId,
      starts,
      ends,
      excludeId,
    );
    if (overlaps.length) {
      throw new ConflictException('Employee is already booked during this time (double-booking).');
    }

    const employee = await this.repo.employeeById(companyId, employeeId);
    if (!employee) throw new NotFoundException('Employee not found.');
    if (employee.status === 'on_leave') {
      throw new ConflictException('Employee is on leave for this period.');
    }

    const weekStart = startOfWeekUtc(starts);
    const weekEnd = addDays(weekStart, 7);
    const weekShifts = await this.repo.employeeShiftsBetween(
      companyId,
      employeeId,
      weekStart,
      weekEnd,
      excludeId,
    );
    const existing = weekShifts.reduce((sum, s) => sum + durationMinutes(s), 0);
    const incoming = Math.max(0, (ends.getTime() - starts.getTime()) / 60_000);
    if (existing + incoming > MAX_WEEK_MINUTES) {
      throw new ConflictException('This assignment exceeds the weekly hours limit (over-hours).');
    }

    if (store && store.capacity > 0) {
      const concurrent = await this.repo.countStoreConcurrent(
        companyId,
        storeId,
        starts,
        ends,
        excludeId,
      );
      const assigned = concurrent.filter((s) => s.employeeId).length;
      if (assigned >= store.capacity) {
        throw new ConflictException('Store is at capacity for this time window.');
      }
    }
  }

  async create(companyId: string, dto: CreateShiftDto): Promise<Shift> {
    this.assertStoreInScope(dto.storeId);
    if (dto.employeeId) {
      await this.assertNoConflicts(
        companyId,
        dto.employeeId,
        dto.storeId,
        dto.startsAtUtc,
        dto.endsAtUtc,
      );
    }
    const values: NewShift = {
      companyId,
      storeId: dto.storeId,
      employeeId: dto.employeeId,
      activityId: dto.activityId,
      role: dto.role,
      startsAtUtc: dto.startsAtUtc,
      endsAtUtc: dto.endsAtUtc,
      breakMinutes: dto.breakMinutes,
      notes: dto.notes,
      status: dto.status ?? (dto.employeeId ? 'assigned' : 'draft'),
      source: dto.source ?? 'manual',
      createdBy: this.currentUserId(),
    };
    return this.repo.create(companyId, values);
  }

  async update(companyId: string, id: string, dto: UpdateShiftDto): Promise<Shift> {
    const current = await this.get(companyId, id);
    const employeeId = dto.employeeId === undefined ? current.employeeId : dto.employeeId;
    const starts = dto.startsAtUtc ?? current.startsAtUtc;
    const ends = dto.endsAtUtc ?? current.endsAtUtc;
    if (ends <= starts) throw new ConflictException('End must be after start.');
    if (employeeId) {
      await this.assertNoConflicts(companyId, employeeId, current.storeId, starts, ends, id);
    }
    return this.repo.update(companyId, id, {
      employeeId,
      activityId: dto.activityId,
      role: dto.role,
      startsAtUtc: dto.startsAtUtc,
      endsAtUtc: dto.endsAtUtc,
      breakMinutes: dto.breakMinutes,
      notes: dto.notes,
      status: dto.status,
    });
  }

  async assign(companyId: string, id: string, dto: AssignShiftDto): Promise<Shift> {
    const shift = await this.get(companyId, id);
    if (dto.employeeId === null) {
      return this.repo.update(companyId, id, { employeeId: null, status: 'draft' });
    }
    await this.assertNoConflicts(
      companyId,
      dto.employeeId,
      shift.storeId,
      shift.startsAtUtc,
      shift.endsAtUtc,
      id,
    );
    const status = shift.status === 'draft' || shift.status === 'off' ? 'assigned' : shift.status;
    return this.repo.update(companyId, id, { employeeId: dto.employeeId, status });
  }

  async approve(companyId: string, id: string): Promise<Shift> {
    await this.get(companyId, id);
    // Legacy "approve" action now marks the shift completed (point 4).
    return this.repo.update(companyId, id, { status: 'completed' });
  }

  async cancel(companyId: string, id: string): Promise<Shift> {
    await this.get(companyId, id);
    return this.repo.update(companyId, id, { status: 'cancelled' });
  }

  async remove(companyId: string, id: string): Promise<{ removed: boolean }> {
    await this.get(companyId, id);
    await this.repo.remove(companyId, id);
    return { removed: true };
  }

  async publish(companyId: string, dto: PublishShiftsDto) {
    this.assertStoreInScope(dto.storeId);
    const published = await this.repo.publishRange(companyId, dto.storeId, dto.from, dto.to);
    // TODO(Phase 6/7): enqueue publish notifications (BullMQ) + emit a Socket.IO
    // event to the store room for live planner updates.
    this.logger.log(`Published ${published.length} shifts for store ${dto.storeId}.`);
    return { published: published.length };
  }

  // ── templates ─────────────────────────────────────────────────────────────
  listTemplates(companyId: string) {
    return this.repo.listTemplates(companyId);
  }

  createTemplate(companyId: string, dto: CreateTemplateDto) {
    if (dto.storeId) this.assertStoreInScope(dto.storeId);
    return this.repo.createTemplate(companyId, {
      companyId,
      name: dto.name,
      storeId: dto.storeId,
      pattern: dto.pattern ?? {},
      active: dto.active ?? true,
    });
  }

  /** Fill a week from a template's pattern (times interpreted as UTC for v0). */
  async applyTemplate(companyId: string, id: string, dto: ApplyTemplateDto) {
    this.assertStoreInScope(dto.storeId);
    const template = await this.repo.findTemplate(companyId, id);
    if (!template) throw new NotFoundException('Template not found.');

    const pattern = (template.pattern ?? {}) as Record<string, TemplateBlock[]>;
    const monday = utcAt(dto.weekStart);
    const rows: NewShift[] = [];
    WEEKDAY_KEYS.forEach((key, i) => {
      const blocks = pattern[key];
      if (!Array.isArray(blocks)) return;
      const dateStr = dayKey(addDays(monday, i));
      for (const block of blocks) {
        if (!block?.start || !block?.end) continue;
        rows.push({
          companyId,
          storeId: dto.storeId,
          role: block.role,
          startsAtUtc: utcAt(dateStr, block.start),
          endsAtUtc: utcAt(dateStr, block.end),
          breakMinutes: block.breakMinutes ?? 0,
          status: 'draft',
          source: 'template',
          createdBy: this.currentUserId(),
        });
      }
    });
    const created = await this.repo.insertMany(companyId, rows);
    return { created: created.length };
  }

  async copyWeek(companyId: string, dto: CopyWeekDto) {
    this.assertStoreInScope(dto.storeId);
    const from = utcAt(dto.fromWeekStart);
    const to = utcAt(dto.toWeekStart);
    const offsetDays = Math.round((to.getTime() - from.getTime()) / DAY_MS);
    const source = await this.repo.storeShiftsBetween(
      companyId,
      dto.storeId,
      from,
      addDays(from, 7),
    );
    const rows: NewShift[] = source.map((s) => ({
      companyId,
      storeId: s.storeId,
      employeeId: s.employeeId,
      activityId: s.activityId,
      role: s.role,
      startsAtUtc: addDays(s.startsAtUtc, offsetDays),
      endsAtUtc: addDays(s.endsAtUtc, offsetDays),
      breakMinutes: s.breakMinutes,
      status: 'draft',
      source: 'template',
      createdBy: this.currentUserId(),
    }));
    const created = await this.repo.insertMany(companyId, rows);
    return { created: created.length };
  }

  // ── coverage & suggestions ────────────────────────────────────────────────
  async coverage(companyId: string, dto: CoverageQueryDto) {
    this.assertStoreInScope(dto.storeId);
    const targets = await this.repo.getTargets(companyId, dto.storeId);
    const targetMap = new Map(targets.map((t) => [`${t.weekday}:${t.hour}`, t.requiredStaff]));

    const from = utcAt(dto.from);
    const to = addDays(utcAt(dto.to), 1); // inclusive end day
    const shifts = await this.repo.storeShiftsBetween(companyId, dto.storeId, from, to);

    const cells: { date: string; hour: number; required: number; scheduled: number }[] = [];
    for (let day = new Date(from); day < to; day = addDays(day, 1)) {
      const date = dayKey(day);
      const wd = weekdayMon0(day);
      for (let hour = 0; hour < 24; hour += 1) {
        const slotStart = utcAt(date, `${String(hour).padStart(2, '0')}:00`).getTime();
        const slotEnd = slotStart + 3_600_000;
        const scheduled = shifts.filter(
          (s) =>
            (s.status === 'assigned' ||
              s.status === 'completed' ||
              s.status === 'published' ||
              s.status === 'approved') &&
            s.startsAtUtc.getTime() < slotEnd &&
            s.endsAtUtc.getTime() > slotStart,
        ).length;
        cells.push({ date, hour, required: targetMap.get(`${wd}:${hour}`) ?? 0, scheduled });
      }
    }
    return { storeId: dto.storeId, cells };
  }

  /** Rules-first staffing suggestions from coverage gaps (merged into ranges). */
  async suggestions(companyId: string, dto: CoverageQueryDto) {
    const { cells } = await this.coverage(companyId, dto);
    const suggestions: {
      storeId: string;
      date: string;
      fromHour: number;
      toHour: number;
      addStaff: number;
      reason: string;
    }[] = [];

    let run: { date: string; fromHour: number; toHour: number; deficit: number } | null = null;
    const flush = () => {
      if (run) {
        suggestions.push({
          storeId: dto.storeId,
          date: run.date,
          fromHour: run.fromHour,
          toHour: run.toHour + 1,
          addStaff: run.deficit,
          reason: `Coverage short by ${run.deficit} staff`,
        });
        run = null;
      }
    };
    for (const c of cells) {
      const deficit = c.required - c.scheduled;
      if (
        deficit > 0 &&
        run &&
        run.date === c.date &&
        run.deficit === deficit &&
        run.toHour === c.hour - 1
      ) {
        run.toHour = c.hour;
      } else {
        flush();
        if (deficit > 0) run = { date: c.date, fromHour: c.hour, toHour: c.hour, deficit };
      }
    }
    flush();
    return suggestions;
  }

  setCoverageTargets(companyId: string, dto: SetCoverageTargetsDto) {
    this.assertStoreInScope(dto.storeId);
    return this.repo
      .setTargets(companyId, dto.storeId, dto.targets)
      .then(() => ({ saved: dto.targets.length }));
  }
}
