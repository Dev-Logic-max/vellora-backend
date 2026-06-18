import { relations, sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { membershipRoleEnum, membershipStatusEnum, scopeTypeEnum } from './enums';
import { users } from './users';

/**
 * The user↔company link that carries role × scope. This is the tenant boundary
 * for people: RLS on `company_id` keeps memberships isolated per tenant, while a
 * user may hold several memberships (e.g. owner of A, employee at B).
 */
export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    role: membershipRoleEnum('role').notNull().default('employee'),
    scopeType: scopeTypeEnum('scope_type').notNull().default('company'),
    scopeIds: text('scope_ids')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    status: membershipStatusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique('memberships_user_company_unique').on(table.userId, table.companyId),
    index('memberships_company_id_idx').on(table.companyId),
    index('memberships_user_id_idx').on(table.userId),
  ],
);

export const membershipsRelations = relations(memberships, ({ one }) => ({
  user: one(users, { fields: [memberships.userId], references: [users.id] }),
  company: one(companies, { fields: [memberships.companyId], references: [companies.id] }),
}));

export type Membership = typeof memberships.$inferSelect;
export type NewMembership = typeof memberships.$inferInsert;
