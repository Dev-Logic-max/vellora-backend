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
import { storeStatusEnum } from './enums';
import { users } from './users';

/**
 * Offices — workplace locations under a company (the company opts into "offices"
 * via `companies.workplace_types`). Mirrors `stores` + office-specific fields
 * (floors, desks/workstations, meeting rooms, departments). Tenant-scoped + RLS.
 */
export const offices = pgTable(
  'offices',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    code: text('code'),
    category: text('category'),
    status: storeStatusEnum('status').notNull().default('active'),
    country: text('country'),
    state: text('state'),
    city: text('city'),
    address: text('address'),
    postalCode: text('postal_code'),
    timezone: text('timezone').notNull().default('UTC'),
    capacity: integer('capacity').notNull().default(0),
    headOffice: boolean('head_office').notNull().default(false),
    logoUrl: text('logo_url'),
    bannerUrl: text('banner_url'),
    // ── office-specific ───────────────────────────────────────────────────────
    floors: integer('floors').notNull().default(1),
    desks: integer('desks').notNull().default(0),
    meetingRooms: integer('meeting_rooms').notNull().default(0),
    departments: text('departments').array().notNull().default([]),
    settings: jsonb('settings').notNull().default({}),
    openingHours: jsonb('opening_hours').notNull().default({}),
    managerUserId: uuid('manager_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique('offices_company_code_unique').on(table.companyId, table.code),
    index('offices_company_id_idx').on(table.companyId),
  ],
);

/**
 * Factories — production workplace locations. Mirrors `stores` + factory-specific
 * fields (production lines, daily output, shift model, safety level). Tenant RLS.
 */
export const factories = pgTable(
  'factories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    code: text('code'),
    category: text('category'),
    status: storeStatusEnum('status').notNull().default('active'),
    country: text('country'),
    state: text('state'),
    city: text('city'),
    address: text('address'),
    postalCode: text('postal_code'),
    timezone: text('timezone').notNull().default('UTC'),
    capacity: integer('capacity').notNull().default(0),
    headFactory: boolean('head_factory').notNull().default(false),
    logoUrl: text('logo_url'),
    bannerUrl: text('banner_url'),
    // ── factory-specific ──────────────────────────────────────────────────────
    productionLines: integer('production_lines').notNull().default(1),
    /** Rated output (units per day). */
    dailyOutput: integer('daily_output').notNull().default(0),
    /** 1 | 2 | 3 shift model. */
    shiftModel: integer('shift_model').notNull().default(2),
    /** 'low' | 'medium' | 'high' — drives the safety badge. */
    safetyLevel: text('safety_level').notNull().default('medium'),
    machineCount: integer('machine_count').notNull().default(0),
    settings: jsonb('settings').notNull().default({}),
    openingHours: jsonb('opening_hours').notNull().default({}),
    managerUserId: uuid('manager_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique('factories_company_code_unique').on(table.companyId, table.code),
    index('factories_company_id_idx').on(table.companyId),
  ],
);

export const officesRelations = relations(offices, ({ one }) => ({
  company: one(companies, { fields: [offices.companyId], references: [companies.id] }),
}));
export const factoriesRelations = relations(factories, ({ one }) => ({
  company: one(companies, { fields: [factories.companyId], references: [companies.id] }),
}));

export type Office = typeof offices.$inferSelect;
export type NewOffice = typeof offices.$inferInsert;
export type Factory = typeof factories.$inferSelect;
export type NewFactory = typeof factories.$inferInsert;
