import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { employees } from './employees';
import { shiftSourceEnum, shiftStatusEnum } from './enums';
import { storeActivities, stores } from './stores';
import { users } from './users';

/**
 * A planned shift at a store (04-shifts §3). Times are stored UTC; the frontend
 * renders them in the store timezone. Tenant-scoped + RLS on company_id.
 */
export const shifts = pgTable(
  'shifts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id').references(() => employees.id, { onDelete: 'set null' }),
    activityId: uuid('activity_id').references(() => storeActivities.id, { onDelete: 'set null' }),
    role: text('role'),
    startsAtUtc: timestamp('starts_at_utc', { withTimezone: true }).notNull(),
    endsAtUtc: timestamp('ends_at_utc', { withTimezone: true }).notNull(),
    breakMinutes: integer('break_minutes').notNull().default(0),
    status: shiftStatusEnum('status').notNull().default('draft'),
    notes: text('notes'),
    source: shiftSourceEnum('source').notNull().default('manual'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('shifts_company_id_idx').on(table.companyId),
    index('shifts_store_id_idx').on(table.storeId),
    index('shifts_employee_id_idx').on(table.employeeId),
    index('shifts_starts_at_idx').on(table.startsAtUtc),
  ],
);

/** Reusable weekly patterns (04-shifts §3). `pattern` maps weekday → array of blocks. */
export const shiftTemplates = pgTable(
  'shift_templates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id').references(() => stores.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    pattern: jsonb('pattern').notNull().default({}),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('shift_templates_company_id_idx').on(table.companyId)],
);

/** Breaks within a shift (04-shifts §3). */
export const shiftBreaks = pgTable(
  'shift_breaks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    shiftId: uuid('shift_id')
      .notNull()
      .references(() => shifts.id, { onDelete: 'cascade' }),
    startsAtUtc: timestamp('starts_at_utc', { withTimezone: true }).notNull(),
    minutes: integer('minutes').notNull().default(0),
    paid: boolean('paid').notNull().default(false),
  },
  (table) => [index('shift_breaks_shift_id_idx').on(table.shiftId)],
);

/** Required staff per store/weekday/hour (04-shifts §3), seeded from affluence. */
export const coverageTargets = pgTable(
  'coverage_targets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    weekday: integer('weekday').notNull(),
    hour: integer('hour').notNull(),
    requiredStaff: integer('required_staff').notNull().default(0),
  },
  (table) => [
    unique('coverage_targets_unique').on(table.storeId, table.weekday, table.hour),
    index('coverage_targets_store_id_idx').on(table.storeId),
  ],
);

export const shiftsRelations = relations(shifts, ({ one, many }) => ({
  store: one(stores, { fields: [shifts.storeId], references: [stores.id] }),
  employee: one(employees, { fields: [shifts.employeeId], references: [employees.id] }),
  activity: one(storeActivities, {
    fields: [shifts.activityId],
    references: [storeActivities.id],
  }),
  breaks: many(shiftBreaks),
}));

export const shiftBreaksRelations = relations(shiftBreaks, ({ one }) => ({
  shift: one(shifts, { fields: [shiftBreaks.shiftId], references: [shifts.id] }),
}));

export type Shift = typeof shifts.$inferSelect;
export type NewShift = typeof shifts.$inferInsert;
export type ShiftTemplate = typeof shiftTemplates.$inferSelect;
export type NewShiftTemplate = typeof shiftTemplates.$inferInsert;
export type ShiftBreak = typeof shiftBreaks.$inferSelect;
export type NewShiftBreak = typeof shiftBreaks.$inferInsert;
export type CoverageTarget = typeof coverageTargets.$inferSelect;
export type NewCoverageTarget = typeof coverageTargets.$inferInsert;
