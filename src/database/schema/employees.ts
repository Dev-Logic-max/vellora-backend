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
import {
  activationRequestStatusEnum,
  contractTypeEnum,
  credentialStatusEnum,
  employeeStatusEnum,
  employeeStoreRelationEnum,
  membershipRoleEnum,
} from './enums';
import { stores } from './stores';
import { users } from './users';

/**
 * The people directory (03-employees §3). One employee belongs to one company
 * (required) and a primary store; secondary/guest/peak stores live in
 * `employee_stores`. `unique_code` (e.g. MIL-EMP-003) is unique per company.
 * `user_id` links to a portal login once invited/accepted. Tenant-scoped + RLS.
 */
export const employees = pgTable(
  'employees',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    primaryStoreId: uuid('primary_store_id').references(() => stores.id, { onDelete: 'set null' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    uniqueCode: text('unique_code').notNull(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    email: text('email'),
    phone: text('phone'),
    /** Work/company email — distinct from the personal `email` used for the portal login. */
    companyEmail: text('company_email'),
    /** The person's JOB title (free text, e.g. "Barista"). The platform/company
     * ROLE (admin/hr/area_manager/store_manager/employee) lives on `memberships`. */
    jobTitle: text('job_title'),
    /** @deprecated kept for back-compat; use `jobTitle`. Mirrors job title. */
    role: text('role'),
    department: text('department'),
    /** The user above this employee in the org (any role above Employee). Self-referential. */
    supervisorId: uuid('supervisor_id'),
    status: employeeStatusEnum('status').notNull().default('active'),
    hireDate: date('hire_date'),
    contractType: contractTypeEnum('contract_type'),
    /** Work-schedule arrangement, distinct from `contractType` (e.g. full_time/part_time/shift/remote). */
    workScheduleType: text('work_schedule_type'),
    weeklyHours: integer('weekly_hours'),
    /** Contract end date (open-ended when null). */
    contractEnd: date('contract_end'),
    // ── personal information ──────────────────────────────────────────────
    nationality: text('nationality'),
    dateOfBirth: date('date_of_birth'),
    gender: text('gender'),
    maritalStatus: text('marital_status'),
    /** National ID / passport number (shown in Personal; banking IBAN is separate). */
    idCardNumber: text('id_card_number'),
    iban: text('iban'),
    // ── address ───────────────────────────────────────────────────────────
    country: text('country'),
    state: text('state'),
    city: text('city'),
    postalCode: text('postal_code'),
    address: text('address'),
    /** Adjustable benefits a company offers this employee (e.g. first-aid/medical). */
    benefits: jsonb('benefits')
      .notNull()
      .default(sql`'{}'::jsonb`),
    avatarUrl: text('avatar_url'),
    locale: text('locale').notNull().default('en'),
    timezone: text('timezone').notNull().default('UTC'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique('employees_company_code_unique').on(table.companyId, table.uniqueCode),
    index('employees_company_id_idx').on(table.companyId),
    index('employees_primary_store_id_idx').on(table.primaryStoreId),
    index('employees_supervisor_id_idx').on(table.supervisorId),
    index('employees_status_idx').on(table.status),
  ],
);

/**
 * Employee bank accounts (banking & accounts §). Tenant-scoped + RLS on
 * company_id. Bank metadata (name/swift/brandColor/country) is denormalized from
 * the `ref_banks` catalog so the row is self-describing even if the catalog
 * changes. One employee may have several; `isPrimary` marks the payroll account.
 */
export const employeeBankAccounts = pgTable(
  // SQL table renamed to user_* terminology; the Drizzle binding name is kept to
  // minimize code churn across the (large) employees module.
  'user_bank_accounts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    /** Optional friendly label (e.g. "Salary", "Expenses"). */
    label: text('label'),
    /** ISO-3166-1 alpha-2 country the bank belongs to. */
    country: text('country'),
    bankName: text('bank_name').notNull(),
    bankSwift: text('bank_swift'),
    bankBrandColor: text('bank_brand_color'),
    accountHolder: text('account_holder'),
    iban: text('iban'),
    accountNumber: text('account_number'),
    /** ISO-4217 currency code for the account. */
    currency: text('currency'),
    /** Optional linked payment card: network (visa/mastercard/…) + last 4 digits. */
    cardNetwork: text('card_network'),
    cardLast4: text('card_last4'),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('employee_bank_accounts_company_id_idx').on(table.companyId),
    index('employee_bank_accounts_employee_id_idx').on(table.employeeId),
  ],
);

/** Secondary store links (primary store is on the employee). Powers transfers + coverage. */
export const employeeStores = pgTable(
  'employee_stores',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    relation: employeeStoreRelationEnum('relation').notNull().default('secondary'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('employee_stores_employee_store_unique').on(table.employeeId, table.storeId),
    index('employee_stores_company_id_idx').on(table.companyId),
    index('employee_stores_employee_id_idx').on(table.employeeId),
  ],
);

/**
 * Employment contracts (03-employees §3) with a managed lifecycle. A contract is
 * `active` until cancelled; a cancelled contract is retained (with audit) until
 * permanently deleted (soft-delete via `deletedAt`). Extend = move `endDate`.
 * `salary` is returned as a string (numeric).
 */
export const contracts = pgTable(
  'contracts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    /** Optional friendly title (e.g. "2026 Barista contract"). */
    title: text('title'),
    type: contractTypeEnum('type').notNull().default('full_time'),
    startDate: date('start_date').notNull(),
    endDate: date('end_date'),
    hoursWeek: integer('hours_week'),
    salary: numeric('salary'),
    currency: text('currency').notNull().default('USD'),
    docId: uuid('doc_id'),
    /** 'active' | 'cancelled' — text to match the additive migration. */
    status: text('status').notNull().default('active'),
    cancelReason: text('cancel_reason'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelledBy: uuid('cancelled_by'),
    /** Soft-delete: a cancelled contract is permanently removed by setting this. */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [index('contracts_employee_id_idx').on(table.employeeId)],
);

/**
 * The user-activation approval queue. When an upper-role user creates a login (or
 * someone self-registers), the membership is created INACTIVE and a pending
 * request is raised here. HR/admin approve (→ Supabase invite, membership active)
 * or reject (→ 24h re-apply cooldown). Plan limits count active memberships only.
 * Tenant-scoped + RLS on company_id.
 */
export const activationRequests = pgTable(
  'activation_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id').references(() => employees.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    membershipId: uuid('membership_id'),
    email: text('email').notNull(),
    requestedRole: membershipRoleEnum('requested_role').notNull().default('employee'),
    status: activationRequestStatusEnum('status').notNull().default('pending'),
    /** 'created' (by an upper role) | 'self_register'. */
    source: text('source').notNull().default('created'),
    requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
    decidedBy: uuid('decided_by').references(() => users.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    rejectReason: text('reject_reason'),
    /** Earliest a rejected applicant may re-apply (reject + 24h). */
    cooldownUntil: timestamp('cooldown_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('activation_requests_company_id_idx').on(table.companyId),
    index('activation_requests_status_idx').on(table.status),
    index('activation_requests_employee_id_idx').on(table.employeeId),
  ],
);

/** Certifications with expiry tracking (paid). `status` cached; display state derived from `expires`. */
export const qualifications = pgTable(
  'qualifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    issuer: text('issuer'),
    issued: date('issued'),
    expires: date('expires'),
    docId: uuid('doc_id'),
    status: credentialStatusEnum('status').notNull().default('valid'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('qualifications_employee_id_idx').on(table.employeeId)],
);

/** Medical checks with expiry (paid). */
export const medicals = pgTable(
  'medicals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    date: date('date'),
    expires: date('expires'),
    status: credentialStatusEnum('status').notNull().default('valid'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('medicals_employee_id_idx').on(table.employeeId)],
);

/** Self-service preferences: availability (per weekday), notification + UI prefs. One row per employee. */
export const empPreferences = pgTable(
  'user_preferences',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    availability: jsonb('availability')
      .notNull()
      .default(sql`'{}'::jsonb`),
    notifPrefs: jsonb('notif_prefs')
      .notNull()
      .default(sql`'{}'::jsonb`),
    uiPrefs: jsonb('ui_prefs')
      .notNull()
      .default(sql`'{}'::jsonb`),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [unique('emp_preferences_employee_unique').on(table.employeeId)],
);

export const employeesRelations = relations(employees, ({ one, many }) => ({
  company: one(companies, { fields: [employees.companyId], references: [companies.id] }),
  primaryStore: one(stores, { fields: [employees.primaryStoreId], references: [stores.id] }),
  user: one(users, { fields: [employees.userId], references: [users.id] }),
  storeLinks: many(employeeStores),
  contracts: many(contracts),
  qualifications: many(qualifications),
  medicals: many(medicals),
  bankAccounts: many(employeeBankAccounts),
}));

export const employeeBankAccountsRelations = relations(employeeBankAccounts, ({ one }) => ({
  employee: one(employees, {
    fields: [employeeBankAccounts.employeeId],
    references: [employees.id],
  }),
}));

export const employeeStoresRelations = relations(employeeStores, ({ one }) => ({
  employee: one(employees, { fields: [employeeStores.employeeId], references: [employees.id] }),
  store: one(stores, { fields: [employeeStores.storeId], references: [stores.id] }),
}));

export const activationRequestsRelations = relations(activationRequests, ({ one }) => ({
  company: one(companies, {
    fields: [activationRequests.companyId],
    references: [companies.id],
  }),
  employee: one(employees, {
    fields: [activationRequests.employeeId],
    references: [employees.id],
  }),
  user: one(users, { fields: [activationRequests.userId], references: [users.id] }),
}));

export type Employee = typeof employees.$inferSelect;
export type NewEmployee = typeof employees.$inferInsert;
export type EmployeeStore = typeof employeeStores.$inferSelect;
export type NewEmployeeStore = typeof employeeStores.$inferInsert;
export type Contract = typeof contracts.$inferSelect;
export type NewContract = typeof contracts.$inferInsert;
export type Qualification = typeof qualifications.$inferSelect;
export type NewQualification = typeof qualifications.$inferInsert;
export type Medical = typeof medicals.$inferSelect;
export type NewMedical = typeof medicals.$inferInsert;
export type EmpPreference = typeof empPreferences.$inferSelect;
export type NewEmpPreference = typeof empPreferences.$inferInsert;
export type EmployeeBankAccount = typeof employeeBankAccounts.$inferSelect;
export type NewEmployeeBankAccount = typeof employeeBankAccounts.$inferInsert;
export type ActivationRequest = typeof activationRequests.$inferSelect;
export type NewActivationRequest = typeof activationRequests.$inferInsert;
