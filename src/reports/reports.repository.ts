import { Injectable } from '@nestjs/common';
import { and, desc, eq, gte, lte, type SQL } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import {
  attendanceLogs,
  employees,
  reportDefs,
  reportRuns,
  stores,
  type Employee,
  type NewReportDef,
  type NewReportRun,
  type ReportDef,
  type ReportRun,
} from '../database/schema';

export interface AttendanceRow {
  storeId: string;
  clockInUtc: Date;
  clockOutUtc: Date | null;
}

/** All reports Drizzle access — aggregates read across modules, RLS-scoped. */
@Injectable()
export class ReportsRepository {
  constructor(private readonly db: DatabaseService) {}

  // ── source data for aggregates ──────────────────────────────────────────────
  employees(companyId: string, storeId?: string): Promise<Employee[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.employees.findMany({
        where: storeId ? eq(employees.primaryStoreId, storeId) : undefined,
        limit: 10_000,
      }),
    );
  }

  stores(companyId: string): Promise<{ id: string; name: string; timezone: string }[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.stores.findMany({ columns: { id: true, name: true, timezone: true } }),
    );
  }

  storeTz(companyId: string, storeId: string): Promise<{ timezone: string } | undefined> {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.stores.findFirst({ where: eq(stores.id, storeId), columns: { timezone: true } }),
    );
  }

  attendanceLogs(
    companyId: string,
    range: { from: Date; to: Date },
    storeId?: string,
  ): Promise<AttendanceRow[]> {
    return this.db.withTenant(companyId, async (tx) => {
      const conds: SQL[] = [
        gte(attendanceLogs.clockInUtc, range.from),
        lte(attendanceLogs.clockInUtc, range.to),
      ];
      if (storeId) conds.push(eq(attendanceLogs.storeId, storeId));
      const rows = await tx.query.attendanceLogs.findMany({
        where: and(...conds),
        columns: { storeId: true, clockInUtc: true, clockOutUtc: true },
        limit: 50_000,
      });
      return rows.map((r) => ({
        storeId: r.storeId,
        clockInUtc: r.clockInUtc,
        clockOutUtc: r.clockOutUtc,
      }));
    });
  }

  // ── report defs ──────────────────────────────────────────────────────────────
  listDefs(companyId: string): Promise<ReportDef[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.reportDefs.findMany({ orderBy: desc(reportDefs.createdAt) }),
    );
  }

  createDef(companyId: string, values: NewReportDef): Promise<ReportDef> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx.insert(reportDefs).values(values).returning();
      return row;
    });
  }

  getDef(companyId: string, id: string): Promise<ReportDef | undefined> {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.reportDefs.findFirst({ where: eq(reportDefs.id, id) }),
    );
  }

  /** Definitions with a non-null schedule — picked up by the scheduled-run job. */
  scheduledDefs(): Promise<ReportDef[]> {
    return this.db.db.query.reportDefs.findMany({});
  }

  // ── report runs ──────────────────────────────────────────────────────────────
  listRuns(companyId: string, reportDefId: string): Promise<ReportRun[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.reportRuns.findMany({
        where: eq(reportRuns.reportDefId, reportDefId),
        orderBy: desc(reportRuns.createdAt),
        limit: 50,
      }),
    );
  }

  createRun(companyId: string, values: NewReportRun): Promise<ReportRun> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx.insert(reportRuns).values(values).returning();
      return row;
    });
  }

  updateRun(companyId: string, id: string, set: Partial<NewReportRun>): Promise<void> {
    return this.db.withTenant(companyId, async (tx) => {
      await tx.update(reportRuns).set(set).where(eq(reportRuns.id, id));
    });
  }

  getRun(companyId: string, id: string): Promise<ReportRun | undefined> {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.reportRuns.findFirst({ where: eq(reportRuns.id, id) }),
    );
  }
}
