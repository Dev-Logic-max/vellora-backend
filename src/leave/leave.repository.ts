import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, lte, type SQL } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import {
  blackoutDates,
  holidays,
  leaveBalances,
  leaveRequests,
  leaveTypes,
  type BlackoutDate,
  type Holiday,
  type LeaveBalance,
  type LeaveRequest,
  type LeaveType,
  type NewBlackoutDate,
  type NewHoliday,
  type NewLeaveBalance,
  type NewLeaveRequest,
  type NewLeaveType,
} from '../database/schema';

const EMPLOYEE_COLS = {
  id: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  uniqueCode: true,
  primaryStoreId: true,
  timezone: true,
} as const;

/** All leave Drizzle access, RLS-scoped via DatabaseService.withTenant. */
@Injectable()
export class LeaveRepository {
  constructor(private readonly db: DatabaseService) {}

  // ── types ──────────────────────────────────────────────────────────────────
  listTypes(companyId: string): Promise<LeaveType[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.leaveTypes.findMany({ orderBy: asc(leaveTypes.name) }),
    );
  }

  findType(companyId: string, id: string) {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.leaveTypes.findFirst({ where: eq(leaveTypes.id, id) }),
    );
  }

  createType(companyId: string, values: NewLeaveType): Promise<LeaveType> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx.insert(leaveTypes).values(values).returning();
      return row;
    });
  }

  updateType(companyId: string, id: string, values: Partial<NewLeaveType>): Promise<LeaveType> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx
        .update(leaveTypes)
        .set(values)
        .where(eq(leaveTypes.id, id))
        .returning();
      return row;
    });
  }

  // ── requests ───────────────────────────────────────────────────────────────
  listRequests(
    companyId: string,
    filters: { employeeId?: string; status?: LeaveRequest['status'] },
    scopeStoreIds: string[] | null,
  ): Promise<LeaveRequest[]> {
    const conds: SQL[] = [];
    if (filters.employeeId) conds.push(eq(leaveRequests.employeeId, filters.employeeId));
    if (filters.status) conds.push(eq(leaveRequests.status, filters.status));
    return this.db.withTenant(companyId, async (tx) => {
      const rows = await tx.query.leaveRequests.findMany({
        where: conds.length ? and(...conds) : undefined,
        orderBy: desc(leaveRequests.createdAt),
        with: { employee: { columns: EMPLOYEE_COLS }, type: true },
        limit: 500,
      });
      if (!scopeStoreIds) return rows;
      return rows.filter(
        (r) => r.employee?.primaryStoreId && scopeStoreIds.includes(r.employee.primaryStoreId),
      );
    });
  }

  findRequest(companyId: string, id: string) {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.leaveRequests.findFirst({
        where: eq(leaveRequests.id, id),
        with: { employee: { columns: EMPLOYEE_COLS }, type: true },
      }),
    );
  }

  createRequest(companyId: string, values: NewLeaveRequest): Promise<LeaveRequest> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx.insert(leaveRequests).values(values).returning();
      return row;
    });
  }

  updateRequest(
    companyId: string,
    id: string,
    values: Partial<NewLeaveRequest>,
  ): Promise<LeaveRequest> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx
        .update(leaveRequests)
        .set(values)
        .where(eq(leaveRequests.id, id))
        .returning();
      return row;
    });
  }

  /** Other approved/requested leave overlapping a window (conflict awareness). */
  overlappingRequests(companyId: string, start: string, end: string, excludeId?: string) {
    return this.db.withTenant(companyId, async (tx) => {
      const rows = await tx.query.leaveRequests.findMany({
        where: and(
          inArray(leaveRequests.status, ['requested', 'approved']),
          lte(leaveRequests.startDate, end),
          gte(leaveRequests.endDate, start),
        ),
        with: { employee: { columns: EMPLOYEE_COLS } },
        limit: 100,
      });
      return excludeId ? rows.filter((r) => r.id !== excludeId) : rows;
    });
  }

  // ── balances ───────────────────────────────────────────────────────────────
  listBalances(
    companyId: string,
    filters: { employeeId?: string; year?: number },
  ): Promise<LeaveBalance[]> {
    const conds: SQL[] = [];
    if (filters.employeeId) conds.push(eq(leaveBalances.employeeId, filters.employeeId));
    if (filters.year) conds.push(eq(leaveBalances.year, filters.year));
    return this.db.withTenant(companyId, (tx) =>
      tx.query.leaveBalances.findMany({
        where: conds.length ? and(...conds) : undefined,
        with: { type: true, employee: { columns: EMPLOYEE_COLS } },
        limit: 1000,
      }),
    );
  }

  findBalance(companyId: string, employeeId: string, typeId: string, year: number) {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.leaveBalances.findFirst({
        where: and(
          eq(leaveBalances.employeeId, employeeId),
          eq(leaveBalances.typeId, typeId),
          eq(leaveBalances.year, year),
        ),
      }),
    );
  }

  upsertBalance(companyId: string, values: NewLeaveBalance): Promise<LeaveBalance> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx
        .insert(leaveBalances)
        .values(values)
        .onConflictDoUpdate({
          target: [leaveBalances.employeeId, leaveBalances.typeId, leaveBalances.year],
          set: { entitled: values.entitled, updatedAt: new Date() },
        })
        .returning();
      return row;
    });
  }

  updateBalance(
    companyId: string,
    id: string,
    values: Partial<NewLeaveBalance>,
  ): Promise<LeaveBalance> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx
        .update(leaveBalances)
        .set(values)
        .where(eq(leaveBalances.id, id))
        .returning();
      return row;
    });
  }

  // ── holidays + blackout ────────────────────────────────────────────────────
  listHolidays(companyId: string, filters: { storeId?: string }): Promise<Holiday[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.holidays.findMany({
        where: filters.storeId ? eq(holidays.storeId, filters.storeId) : undefined,
        orderBy: asc(holidays.date),
        limit: 1000,
      }),
    );
  }

  /** Holiday dates (YYYY-MM-DD) that fall in a window, for day-count exclusion. */
  holidaysInRange(companyId: string, start: string, end: string): Promise<Holiday[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.holidays.findMany({
        where: and(gte(holidays.date, start), lte(holidays.date, end)),
      }),
    );
  }

  createHoliday(companyId: string, values: NewHoliday): Promise<Holiday> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx.insert(holidays).values(values).returning();
      return row;
    });
  }

  deleteHoliday(companyId: string, id: string): Promise<void> {
    return this.db.withTenant(companyId, async (tx) => {
      await tx.delete(holidays).where(eq(holidays.id, id));
    });
  }

  listBlackouts(companyId: string): Promise<BlackoutDate[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.blackoutDates.findMany({ orderBy: asc(blackoutDates.startDate) }),
    );
  }

  blackoutsInRange(companyId: string, start: string, end: string): Promise<BlackoutDate[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.blackoutDates.findMany({
        where: and(lte(blackoutDates.startDate, end), gte(blackoutDates.endDate, start)),
      }),
    );
  }

  createBlackout(companyId: string, values: NewBlackoutDate): Promise<BlackoutDate> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx.insert(blackoutDates).values(values).returning();
      return row;
    });
  }
}
