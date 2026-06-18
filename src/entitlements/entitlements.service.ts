import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { plans } from '../database/schema';

export type Entitlements = Record<string, boolean>;

/** Base plan — what every tenant gets before any paid subscription. */
export const DEFAULT_ENTITLEMENTS: Entitlements = {
  stores: true,
  employees: true,
  scheduling: true,
  attendance: true,
  leave: true,
  documents: true,
  'store.finances': false,
  // Import/export, qualifications & medicals (03-employees §2). Default-on for v0
  // so the flows are testable; flips to plan-gated when billing lands (Phase 8).
  'employee.advanced': true,
  // Demand-aware staffing suggestions (04-shifts §2, Growth+). Default-on for v0
  // so the flow is testable; flips to plan-gated when billing lands (Phase 8).
  'scheduling.suggestions': true,
  analytics: false,
  'permissions.overrides': false,
  'group.policies': false,
};

@Injectable()
export class EntitlementsService {
  constructor(private readonly databaseService: DatabaseService) {}

  /** Effective feature map = base ⊕ the company's subscribed plan. */
  async getEntitlements(companyId: string): Promise<Entitlements> {
    const subscription = await this.databaseService.withTenant(companyId, (tx) =>
      tx.query.subscriptions.findFirst(),
    );
    if (!subscription) return { ...DEFAULT_ENTITLEMENTS };

    // plans is global reference data → read on the privileged connection.
    const plan = await this.databaseService.db.query.plans.findFirst({
      where: eq(plans.id, subscription.planId),
    });
    return { ...DEFAULT_ENTITLEMENTS, ...((plan?.entitlementsJson as Entitlements) ?? {}) };
  }

  async has(companyId: string, feature: string): Promise<boolean> {
    const entitlements = await this.getEntitlements(companyId);
    return entitlements[feature] === true;
  }
}
