import { sql } from 'drizzle-orm';
import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { billingModeEnum } from './enums';

/**
 * Organizational layer ABOVE the tenant (a group owns many companies). Groups
 * are not keyed by `company_id`; they are managed via the privileged connection
 * with app-level owner checks (RLS is deny-all for the tenant role). Group
 * dashboards aggregate across the owner's companies — RLS stays on `company_id`.
 */
export const groups = pgTable('groups', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  logoUrl: text('logo_url'),
  ownerUserIds: uuid('owner_user_ids')
    .array()
    .notNull()
    .default(sql`'{}'::uuid[]`),
  billingMode: billingModeEnum('billing_mode').notNull().default('per_company'),
  settings: jsonb('settings').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;
