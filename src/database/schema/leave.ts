import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { employees } from './employees';
import { leaveRequestStatusEnum } from './enums';
import { stores } from './stores';

/**
 * Time-off policy + ledger (06-leave-holidays §3). Days are computed in store
 * tz, excluding holidays/weekends. Tenant-scoped + RLS on company_id.
 */
export const leaveTypes = pgTable(
  'leave_types',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    paid: boolean('paid').notNull().default(true),
    color: text('color').notNull().default('#4F46E5'),
    /** Multi-step approval requires this type to use a chain (paid). */
    requiresChain: boolean('requires_chain').notNull().default(false),
    accrualRule: jsonb('accrual_rule').notNull().default({}),
    carryoverRule: jsonb('carryover_rule').notNull().default({}),
    maxPerYear: integer('max_per_year'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('leave_types_company_name_unique').on(table.companyId, table.name),
    index('leave_types_company_id_idx').on(table.companyId),
  ],
);

/** A request for time off (06-leave-holidays §3). `approverChain` is an ordered list of step records. */
export const leaveRequests = pgTable(
  'leave_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    typeId: uuid('type_id')
      .notNull()
      .references(() => leaveTypes.id, { onDelete: 'restrict' }),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    halfDay: boolean('half_day').notNull().default(false),
    days: numeric('days').notNull().default('0'),
    reason: text('reason'),
    status: leaveRequestStatusEnum('status').notNull().default('requested'),
    /** Ordered approval steps: [{ step, role|userId, status, by?, at?, note? }]. */
    approverChain: jsonb('approver_chain')
      .notNull()
      .default(sql`'[]'::jsonb`),
    currentStep: integer('current_step').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('leave_requests_company_id_idx').on(table.companyId),
    index('leave_requests_employee_id_idx').on(table.employeeId),
    index('leave_requests_status_idx').on(table.status),
  ],
);

/** Per-employee, per-type, per-year ledger (06-leave-holidays §3). */
export const leaveBalances = pgTable(
  'leave_balances',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    typeId: uuid('type_id')
      .notNull()
      .references(() => leaveTypes.id, { onDelete: 'cascade' }),
    year: integer('year').notNull(),
    entitled: numeric('entitled').notNull().default('0'),
    taken: numeric('taken').notNull().default('0'),
    pending: numeric('pending').notNull().default('0'),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique('leave_balances_unique').on(table.employeeId, table.typeId, table.year),
    index('leave_balances_company_id_idx').on(table.companyId),
  ],
);

/** Company/country/store public holidays, auto-excluded from leave-day math. */
export const holidays = pgTable(
  'holidays',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id').references(() => stores.id, { onDelete: 'cascade' }),
    country: text('country'),
    date: date('date').notNull(),
    name: text('name').notNull(),
    recurring: boolean('recurring').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('holidays_company_id_idx').on(table.companyId),
    index('holidays_date_idx').on(table.date),
  ],
);

/** Peak windows that block leave requests (paid). */
export const blackoutDates = pgTable(
  'blackout_dates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id').references(() => stores.id, { onDelete: 'cascade' }),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('blackout_dates_company_id_idx').on(table.companyId)],
);

export const leaveRequestsRelations = relations(leaveRequests, ({ one }) => ({
  employee: one(employees, { fields: [leaveRequests.employeeId], references: [employees.id] }),
  type: one(leaveTypes, { fields: [leaveRequests.typeId], references: [leaveTypes.id] }),
}));

export const leaveBalancesRelations = relations(leaveBalances, ({ one }) => ({
  employee: one(employees, { fields: [leaveBalances.employeeId], references: [employees.id] }),
  type: one(leaveTypes, { fields: [leaveBalances.typeId], references: [leaveTypes.id] }),
}));

export const holidaysRelations = relations(holidays, ({ one }) => ({
  store: one(stores, { fields: [holidays.storeId], references: [stores.id] }),
}));

export type LeaveType = typeof leaveTypes.$inferSelect;
export type NewLeaveType = typeof leaveTypes.$inferInsert;
export type LeaveRequest = typeof leaveRequests.$inferSelect;
export type NewLeaveRequest = typeof leaveRequests.$inferInsert;
export type LeaveBalance = typeof leaveBalances.$inferSelect;
export type NewLeaveBalance = typeof leaveBalances.$inferInsert;
export type Holiday = typeof holidays.$inferSelect;
export type NewHoliday = typeof holidays.$inferInsert;
export type BlackoutDate = typeof blackoutDates.$inferSelect;
export type NewBlackoutDate = typeof blackoutDates.$inferInsert;

/** A single approval step embedded in `leave_requests.approver_chain`. */
export interface ApprovalStep {
  step: number;
  role?: string;
  userId?: string;
  status: 'pending' | 'approved' | 'rejected';
  by?: string;
  at?: string;
  note?: string;
}
