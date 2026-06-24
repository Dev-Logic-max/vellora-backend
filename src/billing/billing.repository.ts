import { Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import {
  employees,
  invoices,
  memberships,
  plans,
  stores,
  subscriptions,
  usage,
  type Invoice,
  type NewInvoice,
  type Plan,
  type Subscription,
  type Usage,
} from '../database/schema';

/** All billing Drizzle access. Tenant rows go through RLS via withTenant; the
 * global `plans` catalogue is read on the privileged connection. */
@Injectable()
export class BillingRepository {
  constructor(private readonly db: DatabaseService) {}

  // ── plans (global) ──────────────────────────────────────────────────────────
  listPlans(): Promise<Plan[]> {
    return this.db.db.query.plans.findMany({ orderBy: plans.tier });
  }

  planByKey(key: string): Promise<Plan | undefined> {
    return this.db.db.query.plans.findFirst({ where: eq(plans.key, key) });
  }

  planById(id: string): Promise<Plan | undefined> {
    return this.db.db.query.plans.findFirst({ where: eq(plans.id, id) });
  }

  // ── subscription ───────────────────────────────────────────────────────────
  getSubscription(companyId: string): Promise<Subscription | undefined> {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.subscriptions.findFirst({ with: { plan: true } }),
    );
  }

  /** Privileged lookup by Stripe customer/subscription id — webhook context has
   * no tenant token, so we resolve the company from the Stripe identifier. */
  async findByStripeCustomer(customerId: string): Promise<Subscription | undefined> {
    return this.db.db.query.subscriptions.findFirst({
      where: eq(subscriptions.stripeCustomerId, customerId),
    });
  }

  async findByStripeSubscription(subId: string): Promise<Subscription | undefined> {
    return this.db.db.query.subscriptions.findFirst({
      where: eq(subscriptions.stripeSubscriptionId, subId),
    });
  }

  upsertSubscription(
    companyId: string,
    values: Partial<typeof subscriptions.$inferInsert> & { planId: string },
  ): Promise<Subscription> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx
        .insert(subscriptions)
        .values({ companyId, ...values })
        .onConflictDoUpdate({
          target: subscriptions.companyId,
          set: { ...values, updatedAt: new Date() },
        })
        .returning();
      return row;
    });
  }

  /** Webhook path: update by Stripe id on the privileged connection. */
  async updateByStripeCustomer(
    customerId: string,
    set: Partial<typeof subscriptions.$inferInsert>,
  ): Promise<void> {
    await this.db.db
      .update(subscriptions)
      .set({ ...set, updatedAt: new Date() })
      .where(eq(subscriptions.stripeCustomerId, customerId));
  }

  // ── usage ──────────────────────────────────────────────────────────────────
  listUsage(companyId: string): Promise<Usage[]> {
    return this.db.withTenant(companyId, (tx) => tx.query.usage.findMany());
  }

  async setUsage(companyId: string, metric: string, value: number): Promise<void> {
    await this.db.withTenant(companyId, async (tx) => {
      await tx
        .insert(usage)
        .values({ companyId, metric, value })
        .onConflictDoUpdate({
          target: [usage.companyId, usage.metric],
          set: { value, updatedAt: new Date() },
        });
    });
  }

  async countEmployees(companyId: string): Promise<number> {
    return this.db.withTenant(companyId, async (tx) => {
      const rows = await tx.query.employees.findMany({
        where: eq(employees.companyId, companyId),
        columns: { id: true },
      });
      return rows.length;
    });
  }

  async countStores(companyId: string): Promise<number> {
    return this.db.withTenant(companyId, async (tx) => {
      const rows = await tx.query.stores.findMany({
        where: eq(stores.companyId, companyId),
        columns: { id: true },
      });
      return rows.length;
    });
  }

  /** Active memberships = the billable "active users" for plan-limit purposes. */
  async countActiveMemberships(companyId: string): Promise<number> {
    return this.db.withTenant(companyId, async (tx) => {
      const rows = await tx.query.memberships.findMany({
        where: and(eq(memberships.companyId, companyId), eq(memberships.status, 'active')),
        columns: { id: true },
      });
      return rows.length;
    });
  }

  // ── invoices ───────────────────────────────────────────────────────────────
  listInvoices(companyId: string): Promise<Invoice[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.invoices.findMany({ orderBy: desc(invoices.issuedAt), limit: 100 }),
    );
  }

  getInvoice(companyId: string, id: string): Promise<Invoice | undefined> {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.invoices.findFirst({ where: eq(invoices.id, id) }),
    );
  }

  /** Webhook path: upsert a mirrored invoice on the privileged connection. */
  async upsertInvoice(values: NewInvoice): Promise<void> {
    await this.db.db
      .insert(invoices)
      .values(values)
      .onConflictDoUpdate({
        target: invoices.stripeInvoiceId,
        set: {
          status: values.status,
          amount: values.amount,
          hostedUrl: values.hostedUrl,
          pdfUrl: values.pdfUrl,
          paidAt: values.paidAt,
        },
      });
  }

  // ── companies (for customer naming / ids) ──────────────────────────────────
  async companyName(companyId: string): Promise<string> {
    const company = await this.db.withTenant(companyId, (tx) =>
      tx.query.companies.findFirst({ columns: { name: true } }),
    );
    return company?.name ?? 'Company';
  }

  /** All company ids (privileged) — for the nightly usage sync job. */
  async allCompanyIds(): Promise<string[]> {
    const rows = await this.db.db.query.companies.findMany({ columns: { id: true } });
    return rows.map((r) => r.id);
  }

  async trialingSoon(): Promise<Subscription[]> {
    return this.db.db.query.subscriptions.findMany({
      where: and(eq(subscriptions.status, 'trialing')),
    });
  }
}
