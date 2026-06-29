import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Platform operators — the 3 people who run the platform itself (super_admin /
 * platform_admin / operations). Kept SEPARATE from company users: they aren't
 * tenant members and have no company. RLS deny-all (privileged backend bypasses).
 */
export const platformAdmins = pgTable('platform_admins', {
  id: uuid('id').defaultRandom().primaryKey(),
  supabaseUid: uuid('supabase_uid').notNull().unique(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  /** 'super_admin' | 'platform_admin' | 'operations'. */
  platformRole: text('platform_role').notNull().default('operations'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Self-registered platform users — independent of any company (inert for now).
 * Captured separately from company `employees`/users; gated at signup by a
 * company registration id. RLS deny-all.
 */
export const platformSignups = pgTable('platform_signups', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull(),
  name: text('name'),
  /** The company registration code supplied at signup (referral gate). */
  companyRegistrationId: text('company_registration_id'),
  supabaseUid: uuid('supabase_uid'),
  status: text('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type PlatformAdmin = typeof platformAdmins.$inferSelect;
export type NewPlatformAdmin = typeof platformAdmins.$inferInsert;
export type PlatformSignup = typeof platformSignups.$inferSelect;
export type NewPlatformSignup = typeof platformSignups.$inferInsert;
