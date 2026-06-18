import { relations } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { devices } from './devices';
import { employees } from './employees';
import {
  anomalySeverityEnum,
  anomalyStatusEnum,
  anomalyTypeEnum,
  attendanceLogStatusEnum,
  attendanceMethodEnum,
  attendanceSourceEnum,
  correctionStatusEnum,
} from './enums';
import { shifts } from './shifts';
import { stores } from './stores';
import { terminals } from './terminals';
import { users } from './users';

/**
 * A real punch pair for an employee (05-attendance §3). Times are stored UTC;
 * the frontend renders them in the store timezone. Tenant-scoped + RLS.
 */
export const attendanceLogs = pgTable(
  'attendance_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    shiftId: uuid('shift_id').references(() => shifts.id, { onDelete: 'set null' }),
    clockInUtc: timestamp('clock_in_utc', { withTimezone: true }).notNull(),
    clockOutUtc: timestamp('clock_out_utc', { withTimezone: true }),
    method: attendanceMethodEnum('method').notNull().default('manual'),
    deviceId: uuid('device_id').references(() => devices.id, { onDelete: 'set null' }),
    terminalId: uuid('terminal_id').references(() => terminals.id, { onDelete: 'set null' }),
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),
    source: attendanceSourceEnum('source').notNull().default('online'),
    status: attendanceLogStatusEnum('status').notNull().default('open'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('attendance_logs_company_id_idx').on(table.companyId),
    index('attendance_logs_store_id_idx').on(table.storeId),
    index('attendance_logs_employee_id_idx').on(table.employeeId),
    index('attendance_logs_clock_in_idx').on(table.clockInUtc),
  ],
);

/** Breaks within a log (05-attendance §3); paid breaks count toward worked time. */
export const attendanceBreaks = pgTable(
  'attendance_breaks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    logId: uuid('log_id')
      .notNull()
      .references(() => attendanceLogs.id, { onDelete: 'cascade' }),
    startUtc: timestamp('start_utc', { withTimezone: true }).notNull(),
    endUtc: timestamp('end_utc', { withTimezone: true }),
    minutes: integer('minutes').notNull().default(0),
    paid: boolean('paid').notNull().default(false),
  },
  (table) => [index('attendance_breaks_log_id_idx').on(table.logId)],
);

/** Rule-detected attendance issues (05-attendance §3, §6). */
export const anomalies = pgTable(
  'anomalies',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    logId: uuid('log_id').references(() => attendanceLogs.id, { onDelete: 'set null' }),
    type: anomalyTypeEnum('type').notNull(),
    severity: anomalySeverityEnum('severity').notNull().default('medium'),
    status: anomalyStatusEnum('status').notNull().default('open'),
    detectedAt: timestamp('detected_at', { withTimezone: true }).defaultNow().notNull(),
    resolvedBy: uuid('resolved_by').references(() => users.id, { onDelete: 'set null' }),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('anomalies_company_id_idx').on(table.companyId),
    index('anomalies_store_id_idx').on(table.storeId),
    index('anomalies_status_idx').on(table.status),
  ],
);

/** Audited edit requests against a log (05-attendance §3, §8). */
export const corrections = pgTable(
  'corrections',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    logId: uuid('log_id')
      .notNull()
      .references(() => attendanceLogs.id, { onDelete: 'cascade' }),
    field: text('field').notNull(),
    oldValue: text('old_value'),
    newValue: text('new_value'),
    reason: text('reason'),
    requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
    approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),
    status: correctionStatusEnum('status').notNull().default('requested'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (table) => [
    index('corrections_company_id_idx').on(table.companyId),
    index('corrections_log_id_idx').on(table.logId),
  ],
);

export const attendanceLogsRelations = relations(attendanceLogs, ({ one, many }) => ({
  store: one(stores, { fields: [attendanceLogs.storeId], references: [stores.id] }),
  employee: one(employees, { fields: [attendanceLogs.employeeId], references: [employees.id] }),
  shift: one(shifts, { fields: [attendanceLogs.shiftId], references: [shifts.id] }),
  breaks: many(attendanceBreaks),
}));

export const attendanceBreaksRelations = relations(attendanceBreaks, ({ one }) => ({
  log: one(attendanceLogs, { fields: [attendanceBreaks.logId], references: [attendanceLogs.id] }),
}));

export const anomaliesRelations = relations(anomalies, ({ one }) => ({
  employee: one(employees, { fields: [anomalies.employeeId], references: [employees.id] }),
  log: one(attendanceLogs, { fields: [anomalies.logId], references: [attendanceLogs.id] }),
}));

export const correctionsRelations = relations(corrections, ({ one }) => ({
  log: one(attendanceLogs, { fields: [corrections.logId], references: [attendanceLogs.id] }),
}));

export type AttendanceLog = typeof attendanceLogs.$inferSelect;
export type NewAttendanceLog = typeof attendanceLogs.$inferInsert;
export type AttendanceBreak = typeof attendanceBreaks.$inferSelect;
export type NewAttendanceBreak = typeof attendanceBreaks.$inferInsert;
export type Anomaly = typeof anomalies.$inferSelect;
export type NewAnomaly = typeof anomalies.$inferInsert;
export type Correction = typeof corrections.$inferSelect;
export type NewCorrection = typeof corrections.$inferInsert;
