import { relations } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { subscriptionStatusEnum, invoiceStatusEnum } from './enums';

/**
 * Plan catalogue (GLOBAL reference data — no company_id, no RLS). `limits_json`
 * holds usage caps `{ employees, stores, devices, storage_gb, ai_calls }` and
 * `entitlements_json` is the feature map `{ '<feature>': true }`. Read on the
 * privileged connection by EntitlementsService. Stripe price ids live here so a
 * Checkout session can be created from the plan key alone.
 */
export const plans = pgTable('plans', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  /** Display tier order (Free=0, Starter=1, Growth=2, Business=3, …). */
  tier: integer('tier').notNull().default(0),
  priceMonth: numeric('price_month', { precision: 10, scale: 2 }).notNull().default('0'),
  priceYear: numeric('price_year', { precision: 10, scale: 2 }).notNull().default('0'),
  currency: text('currency').notNull().default('USD'),
  entitlementsJson: jsonb('entitlements_json').notNull().default({}),
  limitsJson: jsonb('limits_json').notNull().default({}),
  /** { month?: priceId, year?: priceId } — Stripe Price ids per interval. */
  stripePriceIds: jsonb('stripe_price_ids').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * One subscription per company (group-consolidated billing keys the group's
 * companies to the same Stripe customer — modeled per-company here, group
 * pooling is a later refinement). Stripe is the source of truth for payment
 * state; webhooks mirror status/period here.
 */
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id),
    status: subscriptionStatusEnum('status').notNull().default('trialing'),
    /** Annual vs monthly billing interval for the active subscription. */
    interval: text('interval').notNull().default('month'),
    stripeCustomerId: text('stripe_customer_id'),
    stripeSubscriptionId: text('stripe_subscription_id'),
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    cancelAt: timestamp('cancel_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [unique('subscriptions_company_unique').on(table.companyId)],
);

/** Point-in-time usage counters per metric, kept fresh by the nightly sync job. */
export const usage = pgTable(
  'usage',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    metric: text('metric').notNull(),
    value: integer('value').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique('usage_company_metric_unique').on(table.companyId, table.metric),
    index('usage_company_id_idx').on(table.companyId),
  ],
);

/** Mirror of Stripe invoices (read-only on our side; Stripe is authoritative). */
export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    stripeInvoiceId: text('stripe_invoice_id').notNull(),
    number: text('number'),
    amount: integer('amount').notNull().default(0),
    currency: text('currency').notNull().default('usd'),
    status: invoiceStatusEnum('status').notNull().default('open'),
    hostedUrl: text('hosted_url'),
    pdfUrl: text('pdf_url'),
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('invoices_stripe_invoice_unique').on(table.stripeInvoiceId),
    index('invoices_company_id_idx').on(table.companyId),
  ],
);

/** Per-company negotiated discount window (mirrors company billing settings). */
export const discounts = pgTable(
  'discounts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    pct: integer('pct').notNull().default(0),
    validFrom: timestamp('valid_from', { withTimezone: true }),
    validTo: timestamp('valid_to', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('discounts_company_id_idx').on(table.companyId)],
);

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  plan: one(plans, { fields: [subscriptions.planId], references: [plans.id] }),
}));

export type Plan = typeof plans.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type Usage = typeof usage.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
export type Discount = typeof discounts.$inferSelect;
