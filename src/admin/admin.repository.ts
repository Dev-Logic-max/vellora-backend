import { Injectable } from '@nestjs/common';
import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import {
  companies,
  employees,
  entitlementOverrides,
  featureFlags,
  memberships,
  plans,
  platformAuditLog,
  stores,
  subscriptions,
  users,
  type Company,
  type EntitlementOverride,
  type FeatureFlag,
  type PlatformAuditEntry,
} from '../database/schema';

/** Per-company directory aggregates for the platform Tenants table. */
export interface TenantAggregates {
  storeCount: number;
  employeeCount: number;
  ownerName: string | null;
  ownerAvatarUrl: string | null;
  employeeAvatars: { name: string; avatarUrl: string | null }[];
}

/**
 * Platform-console data access. EVERYTHING here runs on the privileged
 * connection (cross-tenant by design) — the PlatformGuard is the gate, not RLS.
 */
@Injectable()
export class AdminRepository {
  constructor(private readonly db: DatabaseService) {}

  // ── tenants ─────────────────────────────────────────────────────────────────
  listCompanies(): Promise<Company[]> {
    return this.db.db.query.companies.findMany({ orderBy: desc(companies.createdAt), limit: 500 });
  }

  getCompany(id: string): Promise<Company | undefined> {
    return this.db.db.query.companies.findFirst({ where: eq(companies.id, id) });
  }

  async setCompanyStatus(id: string, status: Company['status']): Promise<void> {
    await this.db.db.update(companies).set({ status }).where(eq(companies.id, id));
  }

  async countEmployees(companyId: string): Promise<number> {
    const rows = await this.db.db.query.employees.findMany({
      where: (e, { eq: eqf }) => eqf(e.companyId, companyId),
      columns: { id: true },
    });
    return rows.length;
  }

  /** Batched directory aggregates (stores, employees, owner, avatars) for many
   * companies at once — drives the platform Tenants table. */
  async tenantAggregates(ids: string[]): Promise<Map<string, TenantAggregates>> {
    const out = new Map<string, TenantAggregates>();
    if (ids.length === 0) return out;
    const db = this.db.db;

    const [storeRows, empRows, ownerRows, empSampleRows] = await Promise.all([
      db
        .select({ companyId: stores.companyId, value: count() })
        .from(stores)
        .where(inArray(stores.companyId, ids))
        .groupBy(stores.companyId),
      db
        .select({ companyId: employees.companyId, value: count() })
        .from(employees)
        .where(inArray(employees.companyId, ids))
        .groupBy(employees.companyId),
      db
        .select({
          companyId: memberships.companyId,
          name: sql<string | null>`max(${users.name})`,
          avatarUrl: sql<string | null>`max(${users.avatarUrl})`,
        })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(and(inArray(memberships.companyId, ids), eq(memberships.role, 'owner')))
        .groupBy(memberships.companyId),
      db
        .select({
          companyId: employees.companyId,
          firstName: employees.firstName,
          lastName: employees.lastName,
          avatarUrl: employees.avatarUrl,
        })
        .from(employees)
        .where(inArray(employees.companyId, ids))
        .limit(2000),
    ]);

    const storeMap = new Map(storeRows.map((r) => [r.companyId, Number(r.value)]));
    const empMap = new Map(empRows.map((r) => [r.companyId, Number(r.value)]));
    const ownerMap = new Map(ownerRows.map((r) => [r.companyId, r]));
    const avatarMap = new Map<string, { name: string; avatarUrl: string | null }[]>();
    for (const r of empSampleRows) {
      const list = avatarMap.get(r.companyId) ?? [];
      if (list.length < 4) {
        list.push({ name: `${r.firstName} ${r.lastName}`.trim(), avatarUrl: r.avatarUrl });
        avatarMap.set(r.companyId, list);
      }
    }

    for (const id of ids) {
      out.set(id, {
        storeCount: storeMap.get(id) ?? 0,
        employeeCount: empMap.get(id) ?? 0,
        ownerName: ownerMap.get(id)?.name ?? null,
        ownerAvatarUrl: ownerMap.get(id)?.avatarUrl ?? null,
        employeeAvatars: avatarMap.get(id) ?? [],
      });
    }
    return out;
  }

  // ── subscriptions (plan assignment) ─────────────────────────────────────────
  getSubscription(companyId: string) {
    return this.db.db.query.subscriptions.findFirst({
      where: eq(subscriptions.companyId, companyId),
      with: { plan: true },
    });
  }

  async assignPlan(companyId: string, planId: string): Promise<void> {
    await this.db.db
      .insert(subscriptions)
      .values({ companyId, planId, status: 'active' })
      .onConflictDoUpdate({
        target: subscriptions.companyId,
        set: { planId, status: 'active', updatedAt: new Date() },
      });
  }

  listPlans() {
    return this.db.db.query.plans.findMany({ orderBy: (p, { asc }) => asc(p.sortOrder) });
  }

  getPlan(id: string) {
    return this.db.db.query.plans.findFirst({ where: eq(plans.id, id) });
  }

  async updatePlan(id: string, patch: Partial<typeof plans.$inferInsert>) {
    const [row] = await this.db.db
      .update(plans)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(plans.id, id))
      .returning();
    return row;
  }

  async createPlan(values: typeof plans.$inferInsert) {
    const [row] = await this.db.db.insert(plans).values(values).returning();
    return row;
  }

  // ── entitlement overrides ────────────────────────────────────────────────────
  getOverride(companyId: string): Promise<EntitlementOverride | undefined> {
    return this.db.db.query.entitlementOverrides.findFirst({
      where: eq(entitlementOverrides.companyId, companyId),
    });
  }

  async upsertOverride(
    companyId: string,
    entitlements: Record<string, boolean>,
    limits: Record<string, number>,
    updatedBy?: string,
  ): Promise<void> {
    await this.db.db
      .insert(entitlementOverrides)
      .values({ companyId, entitlements, limits, updatedBy })
      .onConflictDoUpdate({
        target: entitlementOverrides.companyId,
        set: { entitlements, limits, updatedBy, updatedAt: new Date() },
      });
  }

  // ── feature flags ─────────────────────────────────────────────────────────────
  listFlags(): Promise<FeatureFlag[]> {
    return this.db.db.query.featureFlags.findMany({ orderBy: featureFlags.key });
  }

  async upsertFlag(key: string, enabled: boolean, updatedBy?: string): Promise<FeatureFlag> {
    const [row] = await this.db.db
      .insert(featureFlags)
      .values({ key, enabled, updatedBy })
      .onConflictDoUpdate({
        target: featureFlags.key,
        set: { enabled, updatedBy, updatedAt: new Date() },
      })
      .returning();
    return row;
  }

  // ── audit ──────────────────────────────────────────────────────────────────
  writeAudit(values: {
    actorUserId: string;
    action: string;
    targetCompanyId?: string;
    targetUserId?: string;
    meta?: Record<string, unknown>;
  }): Promise<void> {
    return this.db.db
      .insert(platformAuditLog)
      .values({
        actorUserId: values.actorUserId,
        action: values.action,
        targetCompanyId: values.targetCompanyId,
        targetUserId: values.targetUserId,
        meta: values.meta ?? {},
      })
      .then(() => undefined);
  }

  listAudit(limit = 200): Promise<PlatformAuditEntry[]> {
    return this.db.db.query.platformAuditLog.findMany({
      orderBy: desc(platformAuditLog.createdAt),
      limit,
    });
  }
}
