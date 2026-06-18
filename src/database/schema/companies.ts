import { relations, sql } from 'drizzle-orm';
import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companyStatusEnum } from './enums';
import { memberships } from './memberships';

/**
 * Tenant root. Every tenant-scoped row references `companies.id` via a
 * `company_id` column and RLS policies pivot on it. `group_id` / `plan_id` are
 * nullable references to tables introduced in Phase 1 (groups, plans), so they
 * are plain uuids here (no FK yet).
 */
export const companies = pgTable('companies', {
  id: uuid('id').defaultRandom().primaryKey(),
  groupId: uuid('group_id'),
  name: text('name').notNull(),
  country: text('country').notNull().default('US'),
  currency: text('currency').notNull().default('USD'),
  timezone: text('timezone').notNull().default('UTC'),
  status: companyStatusEnum('status').notNull().default('active'),
  planId: uuid('plan_id'),
  logoUrl: text('logo_url'),
  headOfficeAddress: text('head_office_address'),
  offices: jsonb('offices')
    .notNull()
    .default(sql`'[]'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const companiesRelations = relations(companies, ({ many }) => ({
  memberships: many(memberships),
}));

export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;
