import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Platform-admin tables (GLOBAL — no company_id, no RLS). Access is gated by the
 * PlatformGuard (platform_role), NOT by tenant RLS. These tables are reached on
 * the privileged connection by design (cross-tenant operator work).
 */

/** Global feature flags toggled by the platform console. */
export const featureFlags = pgTable('feature_flags', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: text('key').notNull().unique(),
  description: text('description'),
  enabled: boolean('enabled').notNull().default(false),
  updatedBy: uuid('updated_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

/** Per-company entitlement/limit overrides set by the platform console. Merged
 * over the plan's defaults by the entitlement resolver. */
export const entitlementOverrides = pgTable('entitlement_overrides', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().unique(),
  entitlements: jsonb('entitlements').notNull().default({}),
  limits: jsonb('limits').notNull().default({}),
  updatedBy: uuid('updated_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

/** Cross-tenant audit trail for EVERY platform-console action (roles-and-access
 * §3 — impersonation, plan assignment, flags, suspension all land here). */
export const platformAuditLog = pgTable(
  'platform_audit_log',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorUserId: uuid('actor_user_id').notNull(),
    action: text('action').notNull(),
    /** Optional target company / user the action touched. */
    targetCompanyId: uuid('target_company_id'),
    targetUserId: uuid('target_user_id'),
    meta: jsonb('meta').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('platform_audit_log_actor_idx').on(table.actorUserId)],
);

export type FeatureFlag = typeof featureFlags.$inferSelect;
export type EntitlementOverride = typeof entitlementOverrides.$inferSelect;
export type PlatformAuditEntry = typeof platformAuditLog.$inferSelect;
