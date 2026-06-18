import { relations } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { deviceStatusEnum } from './enums';
import { employees } from './employees';

/**
 * A personal device an employee binds to clock in (14-devices-terminals §3).
 * `boundHint` is a SOFT identifier (hashed UA + a registration token), never a
 * hardware fingerprint. Tenant-scoped + RLS on company_id.
 */
export const devices = pgTable(
  'devices',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    platform: text('platform'),
    status: deviceStatusEnum('status').notNull().default('pending'),
    boundHint: text('bound_hint'),
    lastSeen: timestamp('last_seen', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('devices_company_id_idx').on(table.companyId),
    index('devices_employee_id_idx').on(table.employeeId),
  ],
);

export const devicesRelations = relations(devices, ({ one }) => ({
  employee: one(employees, { fields: [devices.employeeId], references: [employees.id] }),
}));

export type Device = typeof devices.$inferSelect;
export type NewDevice = typeof devices.$inferInsert;
