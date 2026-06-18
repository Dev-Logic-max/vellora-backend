import { jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';

/**
 * Plan catalogue (global reference data). `entitlements_json` is a feature map
 * { '<feature>': true } and `limits_json` holds usage caps. Read via the
 * privileged connection by EntitlementsService.
 */
export const plans = pgTable('plans', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  entitlementsJson: jsonb('entitlements_json').notNull().default({}),
  limitsJson: jsonb('limits_json').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/** Stub: one subscription per company → plan (15-billing fleshes this out). */
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
    status: text('status').notNull().default('trialing'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [unique('subscriptions_company_unique').on(table.companyId)],
);

export type Plan = typeof plans.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
