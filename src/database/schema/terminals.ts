import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { stores } from './stores';

/** Stub: store kiosk identity (Phase 4 Devices/Terminals fleshes this out). */
export const terminals = pgTable(
  'terminals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    status: text('status').notNull().default('inactive'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('terminals_company_id_idx').on(table.companyId)],
);

export type Terminal = typeof terminals.$inferSelect;
