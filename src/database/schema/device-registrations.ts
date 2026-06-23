import { relations, sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { employees } from './employees';
import { deviceRegistrationActionEnum, deviceRegistrationStatusEnum } from './enums';
import { users } from './users';

/**
 * A one-time device binding an employee must complete before performing ANY
 * attendance action (14-devices-terminals). One ACTIVE registration per employee
 * per company — enforced by a partial unique index — so no one else can punch
 * for them just by knowing their credentials.
 *
 * `deviceToken` is a server-issued opaque id stored in the device's localStorage
 * (the primary identity). `fingerprint` is an OPTIONAL secondary check (a
 * browser visitorId) only enforced when the company enables it. Tenant-scoped + RLS.
 */
export const deviceRegistrations = pgTable(
  'device_registrations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    /** Opaque token stored on the device (primary identity). */
    deviceToken: text('device_token').notNull(),
    /** Optional browser fingerprint (visitorId) — secondary, company-gated. */
    fingerprint: text('fingerprint'),
    label: text('label'),
    platform: text('platform'),
    userAgent: text('user_agent'),
    status: deviceRegistrationStatusEnum('status').notNull().default('active'),
    registeredAt: timestamp('registered_at', { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    /** Who last revoked/disabled it (HR/admin) and when. */
    revokedBy: uuid('revoked_by').references(() => users.id, { onDelete: 'set null' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('device_registrations_company_id_idx').on(table.companyId),
    index('device_registrations_employee_id_idx').on(table.employeeId),
    // At most ONE active registration per employee. Revoked/disabled rows stay
    // for history but don't block a fresh registration.
    uniqueIndex('device_registrations_one_active_idx')
      .on(table.companyId, table.employeeId)
      .where(sql`status = 'active'`),
  ],
);

/** History trail for a registration — when it was first bound, revoked, disabled,
 * re-registered, and by whom (HR/admin or the employee themselves). */
export const deviceRegistrationLogs = pgTable(
  'device_registration_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    registrationId: uuid('registration_id').references(() => deviceRegistrations.id, {
      onDelete: 'set null',
    }),
    action: deviceRegistrationActionEnum('action').notNull(),
    /** The acting user (the employee self-registering, or the HR/admin). */
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    /** Snapshot of the device label/platform at the time, for the log row. */
    deviceLabel: text('device_label'),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('device_registration_logs_company_id_idx').on(table.companyId),
    index('device_registration_logs_employee_id_idx').on(table.employeeId),
  ],
);

export const deviceRegistrationsRelations = relations(deviceRegistrations, ({ one, many }) => ({
  employee: one(employees, {
    fields: [deviceRegistrations.employeeId],
    references: [employees.id],
  }),
  logs: many(deviceRegistrationLogs),
}));

export const deviceRegistrationLogsRelations = relations(deviceRegistrationLogs, ({ one }) => ({
  registration: one(deviceRegistrations, {
    fields: [deviceRegistrationLogs.registrationId],
    references: [deviceRegistrations.id],
  }),
  employee: one(employees, {
    fields: [deviceRegistrationLogs.employeeId],
    references: [employees.id],
  }),
}));

export type DeviceRegistration = typeof deviceRegistrations.$inferSelect;
export type NewDeviceRegistration = typeof deviceRegistrations.$inferInsert;
export type DeviceRegistrationLog = typeof deviceRegistrationLogs.$inferSelect;
export type NewDeviceRegistrationLog = typeof deviceRegistrationLogs.$inferInsert;
