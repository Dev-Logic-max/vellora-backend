import { relations, sql } from 'drizzle-orm';
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

/** Locations under a company (02-stores §3). Tenant-scoped + RLS on company_id. */
export const stores = pgTable(
  'stores',
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
    headStore: boolean('head_store').notNull().default(false),
    openingHours: jsonb('opening_hours').notNull().default({}),
    managerUserId: uuid('manager_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique('stores_company_code_unique').on(table.companyId, table.code),
    index('stores_company_id_idx').on(table.companyId),
  ],
);

/** Color-coded store activities that seed shift templates (02-stores §6). */
export const storeActivities = pgTable(
  'store_activities',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull().default('#4f46e5'),
    defaultStaffing: integer('default_staffing').notNull().default(0),
    activeDays: text('active_days')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('store_activities_store_id_idx').on(table.storeId)],
);

export const storesRelations = relations(stores, ({ one, many }) => ({
  company: one(companies, { fields: [stores.companyId], references: [companies.id] }),
  activities: many(storeActivities),
}));

export type Store = typeof stores.$inferSelect;
export type NewStore = typeof stores.$inferInsert;
export type StoreActivity = typeof storeActivities.$inferSelect;
export type NewStoreActivity = typeof storeActivities.$inferInsert;
