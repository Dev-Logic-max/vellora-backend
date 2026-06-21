import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gt, gte, inArray, isNull, lt, lte, type SQL } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import {
  anomalies,
  attendanceBreaks,
  attendanceLogs,
  corrections,
  employees,
  memberships,
  shifts,
  type Anomaly,
  type AttendanceBreak,
  type AttendanceLog,
  type Correction,
  type NewAnomaly,
  type NewAttendanceBreak,
  type NewAttendanceLog,
  type NewCorrection,
} from '../database/schema';
import type { MembershipRole } from '../database/schema/enums';

export interface LogFilters {
  storeId?: string;
  employeeId?: string;
  from?: Date;
  to?: Date;
  status?: AttendanceLog['status'];
}

const LOG_EMPLOYEE_COLS = {
  id: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  uniqueCode: true,
  userId: true,
} as const;

/** All attendance Drizzle access, RLS-scoped via DatabaseService.withTenant. */
@Injectable()
export class AttendanceRepository {
  constructor(private readonly db: DatabaseService) {}

  listLogs(
    companyId: string,
    filters: LogFilters,
    scopeStoreIds: string[] | null,
  ): Promise<AttendanceLog[]> {
    const conds: SQL[] = [];
    if (scopeStoreIds) conds.push(inArray(attendanceLogs.storeId, scopeStoreIds));
    if (filters.storeId) conds.push(eq(attendanceLogs.storeId, filters.storeId));
    if (filters.employeeId) conds.push(eq(attendanceLogs.employeeId, filters.employeeId));
    if (filters.status) conds.push(eq(attendanceLogs.status, filters.status));
    if (filters.from) conds.push(gte(attendanceLogs.clockInUtc, filters.from));
    if (filters.to) conds.push(lt(attendanceLogs.clockInUtc, filters.to));
    return this.db.withTenant(companyId, (tx) =>
      tx.query.attendanceLogs.findMany({
        where: conds.length ? and(...conds) : undefined,
        orderBy: desc(attendanceLogs.clockInUtc),
        with: { employee: { columns: LOG_EMPLOYEE_COLS }, breaks: true },
        limit: 500,
      }),
    );
  }

  /** Membership role per userId for this company (the staff "user role"). One
   * query, used to enrich attendance/anomaly rows whose employee has a login. */
  async membershipRolesByUser(
    companyId: string,
    userIds: string[],
  ): Promise<Map<string, MembershipRole>> {
    const ids = [...new Set(userIds.filter(Boolean))];
    if (ids.length === 0) return new Map();
    const rows = await this.db.withTenant(companyId, (tx) =>
      tx
        .select({ userId: memberships.userId, role: memberships.role })
        .from(memberships)
        .where(inArray(memberships.userId, ids)),
    );
    return new Map(rows.map((r) => [r.userId, r.role]));
  }

  findOpenLog(companyId: string, employeeId: string) {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.attendanceLogs.findFirst({
        where: and(eq(attendanceLogs.employeeId, employeeId), isNull(attendanceLogs.clockOutUtc)),
        orderBy: desc(attendanceLogs.clockInUtc),
        with: { breaks: true },
      }),
    );
  }

  findLogById(companyId: string, id: string) {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.attendanceLogs.findFirst({
        where: eq(attendanceLogs.id, id),
        with: { employee: { columns: LOG_EMPLOYEE_COLS }, breaks: true },
      }),
    );
  }

  createLog(companyId: string, values: NewAttendanceLog): Promise<AttendanceLog> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx.insert(attendanceLogs).values(values).returning();
      return row;
    });
  }

  updateLog(
    companyId: string,
    id: string,
    values: Partial<NewAttendanceLog>,
  ): Promise<AttendanceLog> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx
        .update(attendanceLogs)
        .set(values)
        .where(eq(attendanceLogs.id, id))
        .returning();
      return row;
    });
  }

  /** A committed shift covering `at` for this employee, to auto-pair the punch. */
  findScheduledShift(companyId: string, employeeId: string, at: Date) {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.shifts.findFirst({
        where: and(
          eq(shifts.employeeId, employeeId),
          lte(shifts.startsAtUtc, at),
          gt(shifts.endsAtUtc, at),
          inArray(shifts.status, ['assigned', 'published', 'approved']),
        ),
      }),
    );
  }

  /** Most recent committed shift that started today-ish, for no-show / late math. */
  shiftById(companyId: string, id: string) {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.shifts.findFirst({ where: eq(shifts.id, id) }),
    );
  }

  // ── breaks ────────────────────────────────────────────────────────────────
  findOpenBreak(companyId: string, logId: string) {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.attendanceBreaks.findFirst({
        where: and(eq(attendanceBreaks.logId, logId), isNull(attendanceBreaks.endUtc)),
        orderBy: desc(attendanceBreaks.startUtc),
      }),
    );
  }

  createBreak(companyId: string, values: NewAttendanceBreak): Promise<AttendanceBreak> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx.insert(attendanceBreaks).values(values).returning();
      return row;
    });
  }

  updateBreak(
    companyId: string,
    id: string,
    values: Partial<NewAttendanceBreak>,
  ): Promise<AttendanceBreak> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx
        .update(attendanceBreaks)
        .set(values)
        .where(eq(attendanceBreaks.id, id))
        .returning();
      return row;
    });
  }

  // ── anomalies ───────────────────────────────────────────────────────────────
  createAnomaly(companyId: string, values: NewAnomaly): Promise<Anomaly> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx.insert(anomalies).values(values).returning();
      return row;
    });
  }

  listAnomalies(
    companyId: string,
    scopeStoreIds: string[] | null,
    status?: Anomaly['status'],
  ): Promise<Anomaly[]> {
    const conds: SQL[] = [];
    if (scopeStoreIds) conds.push(inArray(anomalies.storeId, scopeStoreIds));
    if (status) conds.push(eq(anomalies.status, status));
    return this.db.withTenant(companyId, (tx) =>
      tx.query.anomalies.findMany({
        where: conds.length ? and(...conds) : undefined,
        orderBy: desc(anomalies.detectedAt),
        with: { employee: { columns: LOG_EMPLOYEE_COLS } },
        limit: 500,
      }),
    );
  }

  findAnomaly(companyId: string, id: string) {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.anomalies.findFirst({ where: eq(anomalies.id, id) }),
    );
  }

  updateAnomaly(companyId: string, id: string, values: Partial<NewAnomaly>): Promise<Anomaly> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx.update(anomalies).set(values).where(eq(anomalies.id, id)).returning();
      return row;
    });
  }

  // ── corrections ───────────────────────────────────────────────────────────────
  createCorrection(companyId: string, values: NewCorrection): Promise<Correction> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx.insert(corrections).values(values).returning();
      return row;
    });
  }

  listCorrections(companyId: string, status?: Correction['status']): Promise<Correction[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.corrections.findMany({
        where: status ? eq(corrections.status, status) : undefined,
        orderBy: asc(corrections.createdAt),
        with: { log: { with: { employee: { columns: LOG_EMPLOYEE_COLS } } } },
        limit: 500,
      }),
    );
  }

  findCorrection(companyId: string, id: string) {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.corrections.findFirst({ where: eq(corrections.id, id), with: { log: true } }),
    );
  }

  updateCorrection(
    companyId: string,
    id: string,
    values: Partial<NewCorrection>,
  ): Promise<Correction> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx
        .update(corrections)
        .set(values)
        .where(eq(corrections.id, id))
        .returning();
      return row;
    });
  }

  // ── lookups ────────────────────────────────────────────────────────────────
  employeeById(companyId: string, id: string) {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.employees.findFirst({
        where: eq(employees.id, id),
        columns: { id: true, firstName: true, lastName: true, primaryStoreId: true, status: true },
      }),
    );
  }
}
