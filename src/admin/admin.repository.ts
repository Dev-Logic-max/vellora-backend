import { Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import {
  companies,
  entitlementOverrides,
  featureFlags,
  platformAuditLog,
  subscriptions,
  type Company,
  type EntitlementOverride,
  type FeatureFlag,
  type PlatformAuditEntry,
} from '../database/schema';

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
    return this.db.db.query.plans.findMany();
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
