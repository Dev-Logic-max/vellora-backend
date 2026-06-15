import { relations } from 'drizzle-orm';
import { boolean, index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { userRoleEnum } from './enums';

/**
 * Application users. `supabaseUserId` links a row to the Supabase Auth
 * identity that owns it; `companyId` is the tenant boundary every query
 * must scope by (see TenantGuard / RLS policies).
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    // Supabase Auth subject (the `sub` claim of the access token).
    supabaseUserId: uuid('supabase_user_id'),
    email: text('email').notNull(),
    fullName: text('full_name'),
    role: userRoleEnum('role').notNull().default('employee'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // Email is unique per tenant, not globally.
    unique('users_company_email_unique').on(table.companyId, table.email),
    index('users_company_id_idx').on(table.companyId),
    index('users_supabase_user_id_idx').on(table.supabaseUserId),
  ],
);

export const usersRelations = relations(users, ({ one }) => ({
  company: one(companies, {
    fields: [users.companyId],
    references: [companies.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
