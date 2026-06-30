import { Injectable } from '@nestjs/common';
import { and, asc, eq, gt, gte, inArray, lt, ne, notInArray, type SQL } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import {
  coverageTargets,
  employees,
  shiftTemplates,
  shifts,
  stores,
  type CoverageTarget,
  type NewShift,
  type Shift,
  type ShiftTemplate,
} from '../database/schema';

export interface ShiftFilters {
  storeId?: string;
  from?: Date;
  to?: Date;
  status?: Shift['status'];
  role?: string;
  employeeId?: string;
}

/** Statuses that count as a real, conflicting commitment of an employee's time.
 * Includes the legacy `published`/`approved` plus the current `completed`. */
const ACTIVE_STATUSES: Shift['status'][] = [
  'draft',
  'assigned',
  'completed',
  'published',
  'approved',
];

/** All scheduling Drizzle access, RLS-scoped via DatabaseService.withTenant. */
@Injectable()
export class SchedulingRepository {
  constructor(private readonly db: DatabaseService) {}

  list(companyId: string, filters: ShiftFilters, scopeStoreIds: string[] | null): Promise<Shift[]> {
    const conds: SQL[] = [];
    if (scopeStoreIds) conds.push(inArray(shifts.storeId, scopeStoreIds));
    if (filters.storeId) conds.push(eq(shifts.storeId, filters.storeId));
    if (filters.status) conds.push(eq(shifts.status, filters.status));
    if (filters.role) conds.push(eq(shifts.role, filters.role));
    if (filters.employeeId) conds.push(eq(shifts.employeeId, filters.employeeId));
    // Overlap with [from, to): starts < to AND ends > from.
    if (filters.to) conds.push(lt(shifts.startsAtUtc, filters.to));
    if (filters.from) conds.push(gt(shifts.endsAtUtc, filters.from));

    return this.db.withTenant(companyId, (tx) =>
      tx.query.shifts.findMany({
        where: conds.length ? and(...conds) : undefined,
        orderBy: asc(shifts.startsAtUtc),
        with: {
          employee: { columns: { id: true, firstName: true, lastName: true, avatarUrl: true } },
          activity: { columns: { id: true, name: true, color: true } },
        },
      }),
    );
  }

  findById(companyId: string, id: string) {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.shifts.findFirst({
        where: eq(shifts.id, id),
        with: {
          employee: { columns: { id: true, firstName: true, lastName: true, avatarUrl: true } },
          breaks: true,
        },
      }),
    );
  }

  create(companyId: string, values: NewShift): Promise<Shift> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx.insert(shifts).values(values).returning();
      return row;
    });
  }

  insertMany(companyId: string, values: NewShift[]): Promise<Shift[]> {
    if (values.length === 0) return Promise.resolve([]);
    return this.db.withTenant(companyId, (tx) => tx.insert(shifts).values(values).returning());
  }

  update(companyId: string, id: string, values: Partial<NewShift>): Promise<Shift> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx.update(shifts).set(values).where(eq(shifts.id, id)).returning();
      return row;
    });
  }

  remove(companyId: string, id: string): Promise<void> {
    return this.db.withTenant(companyId, async (tx) => {
      await tx.delete(shifts).where(eq(shifts.id, id));
    });
  }

  /** Shifts of an employee that overlap [starts, ends) and are still committed. */
  findEmployeeOverlaps(
    companyId: string,
    employeeId: string,
    starts: Date,
    ends: Date,
    excludeId?: string,
  ): Promise<Shift[]> {
    const conds: SQL[] = [
      eq(shifts.employeeId, employeeId),
      inArray(shifts.status, ACTIVE_STATUSES),
      lt(shifts.startsAtUtc, ends),
      gt(shifts.endsAtUtc, starts),
    ];
    if (excludeId) conds.push(ne(shifts.id, excludeId));
    return this.db.withTenant(companyId, (tx) =>
      tx
        .select()
        .from(shifts)
        .where(and(...conds)),
    );
  }

  /**
   * Committed shifts for an employee whose start instant falls inside the
   * [dayStart, dayEnd) UTC window (one store-local calendar day). Backs the
   * "at most one shift per employee per date" rule (point 8). Off-days and
   * cancelled shifts don't count.
   */
  employeeShiftsOnDay(
    companyId: string,
    employeeId: string,
    dayStart: Date,
    dayEnd: Date,
    excludeId?: string,
  ): Promise<Shift[]> {
    const conds: SQL[] = [
      eq(shifts.employeeId, employeeId),
      inArray(shifts.status, ACTIVE_STATUSES),
      gte(shifts.startsAtUtc, dayStart),
      lt(shifts.startsAtUtc, dayEnd),
    ];
    if (excludeId) conds.push(ne(shifts.id, excludeId));
    return this.db.withTenant(companyId, (tx) =>
      tx
        .select()
        .from(shifts)
        .where(and(...conds)),
    );
  }

  /** Concurrent committed shifts at a store overlapping [starts, ends) (for capacity). */
  countStoreConcurrent(
    companyId: string,
    storeId: string,
    starts: Date,
    ends: Date,
    excludeId?: string,
  ): Promise<Shift[]> {
    const conds: SQL[] = [
      eq(shifts.storeId, storeId),
      inArray(shifts.status, ACTIVE_STATUSES),
      lt(shifts.startsAtUtc, ends),
      gt(shifts.endsAtUtc, starts),
    ];
    if (excludeId) conds.push(ne(shifts.id, excludeId));
    return this.db.withTenant(companyId, (tx) =>
      tx
        .select()
        .from(shifts)
        .where(and(...conds)),
    );
  }

  /** Committed shifts for an employee within [weekStart, weekEnd) (for over-hours). */
  employeeShiftsBetween(
    companyId: string,
    employeeId: string,
    weekStart: Date,
    weekEnd: Date,
    excludeId?: string,
  ): Promise<Shift[]> {
    const conds: SQL[] = [
      eq(shifts.employeeId, employeeId),
      inArray(shifts.status, ACTIVE_STATUSES),
      gte(shifts.startsAtUtc, weekStart),
      lt(shifts.startsAtUtc, weekEnd),
    ];
    if (excludeId) conds.push(ne(shifts.id, excludeId));
    return this.db.withTenant(companyId, (tx) =>
      tx
        .select()
        .from(shifts)
        .where(and(...conds)),
    );
  }

  storeShiftsBetween(companyId: string, storeId: string, from: Date, to: Date): Promise<Shift[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx
        .select()
        .from(shifts)
        .where(
          and(
            eq(shifts.storeId, storeId),
            gte(shifts.startsAtUtc, from),
            lt(shifts.startsAtUtc, to),
          ),
        ),
    );
  }

  publishRange(companyId: string, storeId: string, from: Date, to: Date): Promise<Shift[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx
        .update(shifts)
        // Bulk-publish now marks shifts as `completed` (point 4 — `published` is
        // a legacy status no longer surfaced in the UI).
        .set({ status: 'completed' })
        .where(
          and(
            eq(shifts.storeId, storeId),
            gte(shifts.startsAtUtc, from),
            lt(shifts.startsAtUtc, to),
            notInArray(shifts.status, ['cancelled', 'off']),
          ),
        )
        .returning(),
    );
  }

  // ── lookups for conflict guards ─────────────────────────────────────────────
  employeeById(companyId: string, id: string) {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.employees.findFirst({
        where: eq(employees.id, id),
        columns: { id: true, status: true, primaryStoreId: true },
      }),
    );
  }

  storeById(companyId: string, id: string) {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.stores.findFirst({
        where: eq(stores.id, id),
        columns: { id: true, name: true, capacity: true, timezone: true },
      }),
    );
  }

  // ── templates ─────────────────────────────────────────────────────────────
  listTemplates(companyId: string): Promise<ShiftTemplate[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.shiftTemplates.findMany({ orderBy: asc(shiftTemplates.name) }),
    );
  }

  createTemplate(companyId: string, values: typeof shiftTemplates.$inferInsert) {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx.insert(shiftTemplates).values(values).returning();
      return row;
    });
  }

  findTemplate(companyId: string, id: string) {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.shiftTemplates.findFirst({ where: eq(shiftTemplates.id, id) }),
    );
  }

  // ── coverage targets ────────────────────────────────────────────────────────
  getTargets(companyId: string, storeId: string): Promise<CoverageTarget[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.select().from(coverageTargets).where(eq(coverageTargets.storeId, storeId)),
    );
  }

  setTargets(
    companyId: string,
    storeId: string,
    rows: { weekday: number; hour: number; requiredStaff: number }[],
  ): Promise<void> {
    return this.db.withTenant(companyId, async (tx) => {
      await tx.delete(coverageTargets).where(eq(coverageTargets.storeId, storeId));
      if (rows.length) {
        await tx.insert(coverageTargets).values(rows.map((r) => ({ companyId, storeId, ...r })));
      }
    });
  }
}
