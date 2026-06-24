import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Stripe from 'stripe';
import type { AppConfig } from '../config/configuration';
import { EntitlementsService, type Limits } from '../entitlements/entitlements.service';
import { NotificationsService } from '../notifications/notifications.service';
import { QueueService } from '../infra/queue.service';
import { BillingRepository } from './billing.repository';
import { StripeService } from './stripe.service';
import type { CheckoutDto } from './dto/billing.dto';

export const BILLING_QUEUE = 'billing';

/** Metric → the live-count function it maps to (employees/stores enforced now). */
const METERED: Record<string, 'employees' | 'stores'> = {
  employees: 'employees',
  stores: 'stores',
};

/**
 * Billing orchestration (15-billing): Stripe Checkout/Portal, usage metering,
 * plan-limit enforcement, and webhook-driven mirroring of subscription +
 * invoice state. Stripe is authoritative for payment state; we mirror it here.
 * Everything degrades gracefully without a Stripe key (stub URLs, no-op events).
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly appUrl: string;

  constructor(
    private readonly repo: BillingRepository,
    private readonly entitlements: EntitlementsService,
    private readonly notifications: NotificationsService,
    private readonly queue: QueueService,
    private readonly stripeService: StripeService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.appUrl = config.get('appUrl', { infer: true });

    // Nightly usage sync + trial reminders + webhook events run on this queue.
    this.queue.register(BILLING_QUEUE, async (job) => {
      if (job.name === 'usage-sync') await this.syncAllUsage();
      else if (job.name === 'trial-reminders') await this.sendTrialReminders();
      else if (job.name.startsWith('event:')) await this.applyEvent(job.data as Stripe.Event);
    });
  }

  // ── read models ─────────────────────────────────────────────────────────────
  listPlans() {
    return this.repo.listPlans();
  }

  /** Active plans only, sorted for the public registration/pricing cards. */
  async listPublicPlans() {
    const all = await this.repo.listPlans();
    return all
      .filter((p) => p.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.tier - b.tier);
  }

  async getSubscription(companyId: string) {
    return (await this.repo.getSubscription(companyId)) ?? null;
  }

  /** Current usage vs effective caps, computed from live counts. */
  async getUsage(companyId: string) {
    const limits = await this.entitlements.getLimits(companyId);
    const employees = await this.repo.countEmployees(companyId);
    const stores = await this.repo.countStores(companyId);
    const counts: Record<string, number> = { employees, stores };
    return Object.keys(METERED).map((metric) => ({
      metric,
      used: counts[metric] ?? 0,
      limit: limits[metric] ?? -1,
    }));
  }

  listInvoices(companyId: string) {
    return this.repo.listInvoices(companyId);
  }

  async getInvoicePdf(companyId: string, id: string): Promise<{ url: string }> {
    const invoice = await this.repo.getInvoice(companyId, id);
    if (!invoice) throw new NotFoundException('Invoice not found.');
    return { url: invoice.pdfUrl ?? invoice.hostedUrl ?? '' };
  }

  // ── limit enforcement (called from feature modules before an add) ───────────
  /**
   * Throw a `PLAN_LIMIT` 403 if adding `delta` of `metric` would exceed the
   * company's cap. `-1` limit = unlimited. Backend is the gate (api-conventions).
   */
  async assertWithinLimit(
    companyId: string,
    metric: keyof typeof METERED,
    delta = 1,
  ): Promise<void> {
    const limits: Limits = await this.entitlements.getLimits(companyId);
    const limit = limits[metric] ?? -1;
    if (limit < 0) return;
    const used =
      METERED[metric] === 'employees'
        ? await this.repo.countEmployees(companyId)
        : await this.repo.countStores(companyId);
    if (used + delta > limit) {
      throw new ForbiddenException({
        code: 'PLAN_LIMIT',
        message: `Plan limit reached for ${metric} (${used}/${limit}). Upgrade to add more.`,
      });
    }
  }

  /**
   * Plan cap for ACTIVE USERS (active memberships). The `employees` entitlement
   * doubles as the seat cap; only active memberships count (a pending/inactive
   * member doesn't consume a seat until approved). Gate at activation time.
   */
  async assertActiveUserLimit(companyId: string, delta = 1): Promise<void> {
    const limits: Limits = await this.entitlements.getLimits(companyId);
    const limit = limits.employees ?? -1;
    if (limit < 0) return;
    const used = await this.repo.countActiveMemberships(companyId);
    if (used + delta > limit) {
      throw new ForbiddenException({
        code: 'PLAN_LIMIT',
        message: `Plan seat limit reached (${used}/${limit} active users). Upgrade to activate more.`,
      });
    }
  }

  // ── Stripe sessions ─────────────────────────────────────────────────────────
  async createCheckout(companyId: string, dto: CheckoutDto): Promise<{ url: string }> {
    const plan = await this.repo.planByKey(dto.planKey);
    if (!plan) throw new NotFoundException('Unknown plan.');
    const priceIds = (plan.stripePriceIds as Record<string, string>) ?? {};
    const priceId = priceIds[dto.interval];

    const existing = await this.repo.getSubscription(companyId);
    const name = await this.repo.companyName(companyId);
    const customerId = await this.stripeService.ensureCustomer({
      companyId,
      name,
      existingCustomerId: existing?.stripeCustomerId,
    });

    // Persist intent so the (stub-mode) success path reflects the chosen plan,
    // and so the customer id is on file before the webhook lands.
    await this.repo.upsertSubscription(companyId, {
      planId: plan.id,
      interval: dto.interval,
      stripeCustomerId: customerId ?? existing?.stripeCustomerId,
      status: existing?.status ?? 'trialing',
    });

    return this.stripeService.createCheckoutSession({
      customerId,
      priceId: priceId ?? '',
      companyId,
      successUrl: `${this.appUrl}/settings/billing?status=success`,
      cancelUrl: `${this.appUrl}/settings/billing?status=cancelled`,
    });
  }

  async createPortal(companyId: string): Promise<{ url: string }> {
    const existing = await this.repo.getSubscription(companyId);
    return this.stripeService.createPortalSession({
      customerId: existing?.stripeCustomerId ?? null,
      returnUrl: `${this.appUrl}/settings/billing`,
    });
  }

  async changePlan(companyId: string, dto: CheckoutDto): Promise<{ url: string }> {
    // A plan change goes through Checkout (proration handled by Stripe).
    return this.createCheckout(companyId, dto);
  }

  // ── webhook handling (enqueued; no tenant token in this context) ────────────
  enqueueEvent(event: Stripe.Event): Promise<void> {
    return this.queue.enqueue(BILLING_QUEUE, `event:${event.type}`, event);
  }

  async enqueueUsageSync(): Promise<{ queued: true }> {
    await this.queue.enqueue(BILLING_QUEUE, 'usage-sync', {});
    return { queued: true };
  }

  async enqueueTrialReminders(): Promise<{ queued: true }> {
    await this.queue.enqueue(BILLING_QUEUE, 'trial-reminders', {});
    return { queued: true };
  }

  /** Apply a verified Stripe event to our mirror. Runs in the queue worker. */
  async applyEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await this.applySubscription(event);
        break;
      case 'invoice.paid':
      case 'invoice.payment_failed':
      case 'invoice.finalized':
        await this.applyInvoice(event.data.object);
        break;
      default:
        this.logger.debug(`Unhandled Stripe event ${event.type}`);
    }
  }

  private async applySubscription(event: Stripe.Event): Promise<void> {
    const obj = event.data.object as Stripe.Subscription & {
      customer?: string;
      current_period_end?: number;
      status?: string;
    };
    const customerId = typeof obj.customer === 'string' ? obj.customer : undefined;
    if (!customerId) return;
    const statusMap: Record<string, 'trialing' | 'active' | 'past_due' | 'canceled'> = {
      trialing: 'trialing',
      active: 'active',
      past_due: 'past_due',
      unpaid: 'past_due',
      canceled: 'canceled',
      incomplete_expired: 'canceled',
    };
    const status = statusMap[obj.status ?? 'active'] ?? 'active';
    await this.repo.updateByStripeCustomer(customerId, {
      status,
      stripeSubscriptionId: typeof obj.id === 'string' ? obj.id : undefined,
      currentPeriodEnd: obj.current_period_end
        ? new Date(obj.current_period_end * 1000)
        : undefined,
    });
  }

  private async applyInvoice(invoice: Stripe.Invoice): Promise<void> {
    const customerId = typeof invoice.customer === 'string' ? invoice.customer : undefined;
    if (!customerId) return;
    const sub = await this.repo.findByStripeCustomer(customerId);
    if (!sub) return;
    const statusMap: Record<string, 'draft' | 'open' | 'paid' | 'void'> = {
      draft: 'draft',
      open: 'open',
      paid: 'paid',
      void: 'void',
      uncollectible: 'void',
    };
    await this.repo.upsertInvoice({
      companyId: sub.companyId,
      stripeInvoiceId: invoice.id ?? `inv_${Date.now()}`,
      number: invoice.number ?? null,
      amount: invoice.amount_due ?? invoice.total ?? 0,
      currency: invoice.currency ?? 'usd',
      status: statusMap[invoice.status ?? 'open'] ?? 'open',
      hostedUrl: invoice.hosted_invoice_url ?? null,
      pdfUrl: invoice.invoice_pdf ?? null,
      issuedAt: invoice.created ? new Date(invoice.created * 1000) : new Date(),
      paidAt: invoice.status === 'paid' ? new Date() : null,
    });
  }

  // ── jobs ────────────────────────────────────────────────────────────────────
  private async syncAllUsage(): Promise<void> {
    const ids = await this.repo.allCompanyIds();
    for (const companyId of ids) {
      await this.repo.setUsage(companyId, 'employees', await this.repo.countEmployees(companyId));
      await this.repo.setUsage(companyId, 'stores', await this.repo.countStores(companyId));
    }
  }

  private async sendTrialReminders(): Promise<void> {
    const trialing = await this.repo.trialingSoon();
    const now = Date.now();
    for (const sub of trialing) {
      if (!sub.trialEndsAt) continue;
      const daysLeft = Math.ceil((sub.trialEndsAt.getTime() - now) / 86_400_000);
      if (daysLeft < 0 || daysLeft > 3) continue;
      // Notify the company owners that the trial is ending soon.
      await this.notifications.broadcast(sub.companyId, {
        role: 'owner',
        category: 'billing',
        type: 'trial.ending',
        title: 'Your trial is ending soon',
        body: `Your free trial ends in ${daysLeft} day(s). Add a plan to keep premium features.`,
        href: '/settings/billing',
        priority: 'high',
      });
    }
  }
}
