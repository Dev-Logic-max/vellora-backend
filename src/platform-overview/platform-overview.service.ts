import { Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import {
  companies,
  employees,
  factories,
  memberships,
  offices,
  products,
  stores,
} from '../database/schema';

/**
 * PLATFORM-WIDE aggregate reads for platform operators (super_admin /
 * platform_admin / operations). Unlike the tenant-scoped module services, these
 * span EVERY company — they use the privileged (RLS-bypassing) connection and
 * tag each row with its company so the UI can show "which company". Guarded by
 * PlatformGuard at the controller (NO TenantGuard). Company admins keep using
 * the normal tenant-scoped endpoints.
 */
@Injectable()
export class PlatformOverviewService {
  constructor(private readonly db: DatabaseService) {}

  /** A company-name lookup so every aggregated row carries its company label. */
  private async companyNames(): Promise<Map<string, { name: string; country: string | null }>> {
    const rows = await this.db.db
      .select({ id: companies.id, name: companies.name, country: companies.country })
      .from(companies);
    return new Map(rows.map((r) => [r.id, { name: r.name, country: r.country }]));
  }

  async stores() {
    const names = await this.companyNames();
    const rows = await this.db.db.select().from(stores).orderBy(desc(stores.createdAt));
    return rows.map((s) => ({ ...s, companyName: names.get(s.companyId)?.name ?? null }));
  }

  async offices() {
    const names = await this.companyNames();
    const rows = await this.db.db.select().from(offices).orderBy(desc(offices.createdAt));
    return rows.map((o) => ({ ...o, companyName: names.get(o.companyId)?.name ?? null }));
  }

  async factories() {
    const names = await this.companyNames();
    const rows = await this.db.db.select().from(factories).orderBy(desc(factories.createdAt));
    return rows.map((f) => ({ ...f, companyName: names.get(f.companyId)?.name ?? null }));
  }

  async products() {
    const names = await this.companyNames();
    const rows = await this.db.db.select().from(products).orderBy(desc(products.createdAt));
    return rows.map((p) => ({ ...p, companyName: names.get(p.companyId)?.name ?? null }));
  }

  /**
   * Every person across all companies, enriched with company name + the person's
   * platform/company role (from membership). Mirrors the tenant employee list
   * shape (firstName/lastName/role/membershipRole/…) so the FE table reuses.
   */
  async employees() {
    const names = await this.companyNames();
    const rows = await this.db.db
      .select({ employee: employees, membershipRole: memberships.role })
      .from(employees)
      .leftJoin(
        memberships,
        eq(memberships.userId, employees.userId),
      )
      .orderBy(desc(employees.createdAt));
    // Dedup by employee id (the join can fan out if a user has memberships in
    // multiple companies — keep the membership matching the employee's company).
    const byId = new Map<string, (typeof rows)[number]>();
    for (const r of rows) {
      if (!byId.has(r.employee.id)) byId.set(r.employee.id, r);
    }
    return [...byId.values()].map((r) => ({
      ...r.employee,
      membershipRole: r.membershipRole,
      companyName: names.get(r.employee.companyId)?.name ?? null,
    }));
  }

  /** Headline platform counts for the operator dashboard/overview. */
  async summary() {
    const [companyRows, storeRows, officeRows, factoryRows, employeeRows, membershipRows] =
      await Promise.all([
        this.db.db.select({ id: companies.id }).from(companies),
        this.db.db.select({ id: stores.id }).from(stores),
        this.db.db.select({ id: offices.id }).from(offices),
        this.db.db.select({ id: factories.id }).from(factories),
        this.db.db.select({ id: employees.id }).from(employees),
        this.db.db.select({ role: memberships.role }).from(memberships),
      ]);
    const roleCounts: Record<string, number> = {};
    for (const m of membershipRows) roleCounts[m.role] = (roleCounts[m.role] ?? 0) + 1;
    return {
      companies: companyRows.length,
      stores: storeRows.length,
      offices: officeRows.length,
      factories: factoryRows.length,
      employees: employeeRows.length,
      roleCounts,
    };
  }
}
