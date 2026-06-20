import { relations } from 'drizzle-orm';
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { memberships } from './memberships';
import { platformRoleEnum } from './enums';

/**
 * Global identities — NOT tenant-scoped. A user is linked to one or more
 * companies through `memberships` (role × scope lives there). `supabaseUid`
 * ties the row to the Supabase Auth identity (`sub` claim). `platformRole` (null
 * for normal tenant users) grants cross-tenant operator access to `/admin`.
 */
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  supabaseUid: uuid('supabase_uid').notNull().unique(),
  name: text('name'),
  email: text('email').notNull().unique(),
  avatarUrl: text('avatar_url'),
  locale: text('locale').notNull().default('en'),
  platformRole: platformRoleEnum('platform_role'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(memberships),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
