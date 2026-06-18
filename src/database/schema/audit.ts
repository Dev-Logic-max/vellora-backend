import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';

/** Immutable change log for permission/visibility/company-status changes. */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    actorUserId: uuid('actor_user_id'),
    action: text('action').notNull(),
    resource: text('resource').notNull(),
    targetId: text('target_id'),
    meta: jsonb('meta').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('audit_log_company_id_idx').on(table.companyId)],
);

export type AuditEntry = typeof auditLog.$inferSelect;
