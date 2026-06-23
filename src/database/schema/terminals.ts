import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { stores } from './stores';
import { users } from './users';

/**
 * A store kiosk/PC/tablet that displays the rotating clock-in QR
 * (14-devices-terminals §3). `status` holds a TerminalStatus value
 * ('pending' | 'active' | 'inactive' | 'blocked'); `qrSecret` rotates so a
 * stale QR stops working. ONE terminal per store (partial unique index excludes
 * deleted rows — there's no soft-delete, so it's effectively one row per store).
 * Tenant-scoped + RLS on company_id.
 */
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
    status: text('status').notNull().default('pending'),
    qrSecret: text('qr_secret'),
    qrRotatedAt: timestamp('qr_rotated_at', { withTimezone: true }),
    lastSeen: timestamp('last_seen', { withTimezone: true }),
    /** Who froze it (super-admin deactivate) and when, for the audit trail. */
    deactivatedBy: uuid('deactivated_by').references(() => users.id, { onDelete: 'set null' }),
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('terminals_company_id_idx').on(table.companyId),
    // One terminal per store.
    uniqueIndex('terminals_store_unique_idx').on(table.storeId),
  ],
);

export type Terminal = typeof terminals.$inferSelect;
export type NewTerminal = typeof terminals.$inferInsert;
