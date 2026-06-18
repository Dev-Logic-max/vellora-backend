import { boolean, index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { membershipRoleEnum } from './enums';

/**
 * Per-company permission OVERRIDES (10-permissions §3). Role defaults live in
 * code; a row here flips one `resource.action` for a role in a company.
 * Effective access = entitlement ∧ permission ∧ scope.
 */
export const permissions = pgTable(
  'permissions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    role: membershipRoleEnum('role').notNull(),
    resource: text('resource').notNull(),
    action: text('action').notNull(),
    allowed: boolean('allowed').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique('permissions_unique').on(table.companyId, table.role, table.resource, table.action),
    index('permissions_company_id_idx').on(table.companyId),
  ],
);

/** Show/hide whole modules per role, for nav declutter (10-permissions §5). */
export const moduleVisibility = pgTable(
  'module_visibility',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    role: membershipRoleEnum('role').notNull(),
    moduleKey: text('module_key').notNull(),
    visible: boolean('visible').notNull().default(true),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [unique('module_visibility_unique').on(table.companyId, table.role, table.moduleKey)],
);

export type Permission = typeof permissions.$inferSelect;
export type NewPermission = typeof permissions.$inferInsert;
export type ModuleVisibility = typeof moduleVisibility.$inferSelect;
