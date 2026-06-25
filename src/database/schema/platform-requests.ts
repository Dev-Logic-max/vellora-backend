import { relations } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { users } from './users';

/**
 * Tenant → platform request inbox. A company raises a request (a company-deletion
 * request, a report, a support query, …); the platform operator triages and
 * responds. **Tenant-scoped + RLS** so a company only ever sees its OWN requests;
 * the platform console reads cross-tenant on the privileged connection (the
 * PlatformGuard is the gate there — same pattern as the rest of the admin module).
 *
 * `type`/`priority`/`status`/`actionStatus` are stored as text (validated by the
 * DTO/zod) to avoid enum-add migration churn — see the const arrays in enums.ts.
 */
export const platformRequests = pgTable(
  'platform_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    /** The category/module the request is about (e.g. 'company_deletion'). */
    type: text('type').notNull(),
    /** Free-text module/area label shown in the table (e.g. "Companies", "Billing"). */
    module: text('module'),
    priority: text('priority').notNull().default('medium'),
    subject: text('subject').notNull(),
    message: text('message'),
    /** Platform-side record status (received/in_review/replied/resolved/rejected). */
    status: text('status').notNull().default('received'),
    /** User-side action status (waiting/read/responded/closed). */
    actionStatus: text('action_status').notNull().default('waiting'),
    /** Who raised it (a tenant user). */
    requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
    /** The platform operator who last handled it. */
    handledBy: uuid('handled_by').references(() => users.id, { onDelete: 'set null' }),
    /** The operator's reply / resolution note. */
    response: text('response'),
    /** Extra structured context (e.g. { confirmName } for deletion). */
    meta: jsonb('meta').notNull().default({}),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('platform_requests_company_id_idx').on(table.companyId),
    index('platform_requests_status_idx').on(table.status),
    index('platform_requests_type_idx').on(table.type),
  ],
);

export const platformRequestsRelations = relations(platformRequests, ({ one }) => ({
  company: one(companies, {
    fields: [platformRequests.companyId],
    references: [companies.id],
  }),
}));

export type PlatformRequest = typeof platformRequests.$inferSelect;
export type NewPlatformRequest = typeof platformRequests.$inferInsert;
