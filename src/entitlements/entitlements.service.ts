import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { plans } from '../database/schema';

export type Entitlements = Record<string, boolean>;
export type Limits = Record<string, number>;

export interface EffectiveAccess {
  planKey: string;
  planName: string;
  entitlements: Entitlements;
  limits: Limits;
}

/**
 * Default caps for the base (Free) plan. `-1` means unlimited. The metered
 * usage enforcer (BillingService) compares live counts against these.
 */
export const DEFAULT_LIMITS: Limits = {
  employees: 10,
  stores: 1,
  devices: 2,
  storage_gb: 1,
  ai_calls: 0,
};

/** Base plan — what every tenant gets before any paid subscription. */
export const DEFAULT_ENTITLEMENTS: Entitlements = {
  stores: true,
  employees: true,
  scheduling: true,
  attendance: true,
  leave: true,
  documents: true,
  // Messaging + email tab (13-messaging §2, Starter+). Default-on for v1 so the
  // flows are testable; flips to plan-gated when billing lands (Phase 8).
  messaging: true,
  'store.finances': false,
  // Import/export, qualifications & medicals (03-employees §2). Default-on for v0
  // so the flows are testable; flips to plan-gated when billing lands (Phase 8).
  'employee.advanced': true,
  // Demand-aware staffing suggestions (04-shifts §2, Growth+). Default-on for v0
  // so the flow is testable; flips to plan-gated when billing lands (Phase 8).
  'scheduling.suggestions': true,
  // Anomalies module, corrections workflow, geolocation + timesheet export
  // (05-attendance §2, Growth/Business+). Default-on for v0 so flows are
  // testable; flips to plan-gated when billing lands (Phase 8).
  'attendance.advanced': true,
  // Multi-step approval chains, blackout dates, accrual/carryover policies
  // (06-leave-holidays §2, Starter/Growth+). Default-on for v0; flips to
  // plan-gated when billing lands (Phase 8).
  'leave.advanced': true,
  onboarding: true,
  transfers: true,
  // Recruiting + reports/analytics land in Phase 9. Default-on for v1 so the
  // flows are testable; the seeded plans gate them per-tier (Growth+).
  recruiting: true,
  reports: true,
  analytics: false,
  'permissions.overrides': false,
  'group.policies': false,
};

@Injectable()
export class EntitlementsService {
  constructor(private readonly databaseService: DatabaseService) {}

  /** Effective feature map = base ⊕ the company's subscribed plan. */
  async getEntitlements(companyId: string): Promise<Entitlements> {
    return (await this.getEffective(companyId)).entitlements;
  }

  /** Effective caps = base ⊕ the company's subscribed plan. */
  async getLimits(companyId: string): Promise<Limits> {
    return (await this.getEffective(companyId)).limits;
  }

  /**
   * Full effective access for a company: plan key/name + the merged
   * entitlements and limits. A trialing/active subscription's plan wins over the
   * base; everyone else stays on the Free defaults.
   */
  async getEffective(companyId: string): Promise<EffectiveAccess> {
    const subscription = await this.databaseService.withTenant(companyId, (tx) =>
      tx.query.subscriptions.findFirst(),
    );
    const base: EffectiveAccess = {
      planKey: 'free',
      planName: 'Free',
      entitlements: { ...DEFAULT_ENTITLEMENTS },
      limits: { ...DEFAULT_LIMITS },
    };
    if (!subscription || subscription.status === 'canceled') return base;

    // plans is global reference data → read on the privileged connection.
    const plan = await this.databaseService.db.query.plans.findFirst({
      where: eq(plans.id, subscription.planId),
    });
    if (!plan) return base;
    return {
      planKey: plan.key,
      planName: plan.name,
      entitlements: {
        ...DEFAULT_ENTITLEMENTS,
        ...((plan.entitlementsJson as Entitlements) ?? {}),
      },
      limits: { ...DEFAULT_LIMITS, ...((plan.limitsJson as Limits) ?? {}) },
    };
  }

  async has(companyId: string, feature: string): Promise<boolean> {
    const entitlements = await this.getEntitlements(companyId);
    return entitlements[feature] === true;
  }
}
