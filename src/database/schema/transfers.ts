import { relations } from 'drizzle-orm';
import { date, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { employees } from './employees';
import { transferKindEnum, transferStatusEnum } from './enums';
import { stores } from './stores';
import { users } from './users';

/**
 * Moving an employee between stores (12-transfers §3). Temporary transfers create
 * an employee_stores link for the window and auto-revert at the end; permanent
 * ones update the primary store. Tenant-scoped + RLS on company_id.
 */
export const transfers = pgTable(
  'transfers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    fromStoreId: uuid('from_store_id').references(() => stores.id, { onDelete: 'set null' }),
    toStoreId: uuid('to_store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    kind: transferKindEnum('kind').notNull().default('temporary'),
    /** Set for temporary transfers; null for permanent. */
    startDate: date('start_date'),
    endDate: date('end_date'),
    reason: text('reason'),
    status: transferStatusEnum('status').notNull().default('requested'),
    /** The employee_stores link spun up for a temporary transfer, removed on revert. */
    linkId: uuid('link_id'),
    requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
    approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('transfers_company_id_idx').on(table.companyId),
    index('transfers_employee_id_idx').on(table.employeeId),
    index('transfers_status_idx').on(table.status),
  ],
);

export const transfersRelations = relations(transfers, ({ one }) => ({
  employee: one(employees, { fields: [transfers.employeeId], references: [employees.id] }),
  fromStore: one(stores, { fields: [transfers.fromStoreId], references: [stores.id] }),
  toStore: one(stores, { fields: [transfers.toStoreId], references: [stores.id] }),
}));

export type Transfer = typeof transfers.$inferSelect;
export type NewTransfer = typeof transfers.$inferInsert;
