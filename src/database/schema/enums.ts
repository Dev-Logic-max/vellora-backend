import { pgEnum } from 'drizzle-orm/pg-core';

/**
 * Tenant-plane roles held via a membership (see roles-and-access.md §3). The
 * platform plane (super_admin, etc.) is modeled separately and added later.
 */
export const MEMBERSHIP_ROLES = [
  'owner',
  'hr',
  'area_manager',
  'store_manager',
  'employee',
] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];
export const membershipRoleEnum = pgEnum('membership_role', MEMBERSHIP_ROLES);

/**
 * Where a membership applies (roles-and-access.md §4). `scope_ids` narrows it,
 * e.g. an area manager's `scope_type = 'area'` with the store ids in scope.
 */
export const SCOPE_TYPES = ['group', 'company', 'area', 'store', 'self'] as const;
export type ScopeType = (typeof SCOPE_TYPES)[number];
export const scopeTypeEnum = pgEnum('scope_type', SCOPE_TYPES);

/** Lifecycle of a single user↔company membership. */
export const MEMBERSHIP_STATUSES = ['active', 'invited', 'suspended', 'inactive'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];
export const membershipStatusEnum = pgEnum('membership_status', MEMBERSHIP_STATUSES);

/** Company lifecycle (roles-and-access.md §6). */
export const COMPANY_STATUSES = ['pending', 'active', 'inactive', 'suspended', 'deleted'] as const;
export type CompanyStatus = (typeof COMPANY_STATUSES)[number];
export const companyStatusEnum = pgEnum('company_status', COMPANY_STATUSES);

/** How a group is billed (roles-and-access.md §6). */
export const BILLING_MODES = ['consolidated', 'per_company'] as const;
export type BillingMode = (typeof BILLING_MODES)[number];
export const billingModeEnum = pgEnum('billing_mode', BILLING_MODES);

/** Store lifecycle (02-stores §8). */
export const STORE_STATUSES = ['pending', 'active', 'inactive', 'suspended', 'archived'] as const;
export type StoreStatus = (typeof STORE_STATUSES)[number];
export const storeStatusEnum = pgEnum('store_status', STORE_STATUSES);

/** Employee lifecycle (03-employees §8). */
export const EMPLOYEE_STATUSES = [
  'invited',
  'active',
  'on_leave',
  'suspended',
  'archived',
] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];
export const employeeStatusEnum = pgEnum('employee_status', EMPLOYEE_STATUSES);

/** Contract / engagement type for an employee or a contract row (03-employees §3). */
export const CONTRACT_TYPES = [
  'full_time',
  'part_time',
  'temporary',
  'contractor',
  'intern',
] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];
export const contractTypeEnum = pgEnum('contract_type', CONTRACT_TYPES);

/** How a secondary store link is used (03-employees §3). The primary store lives on the employee row. */
export const EMPLOYEE_STORE_RELATIONS = ['secondary', 'guest', 'peak'] as const;
export type EmployeeStoreRelation = (typeof EMPLOYEE_STORE_RELATIONS)[number];
export const employeeStoreRelationEnum = pgEnum(
  'employee_store_relation',
  EMPLOYEE_STORE_RELATIONS,
);

/** Qualification / medical validity (03-employees §8). `expiring` is derived on read (≤30d). */
export const CREDENTIAL_STATUSES = ['valid', 'expiring', 'expired'] as const;
export type CredentialStatus = (typeof CREDENTIAL_STATUSES)[number];
export const credentialStatusEnum = pgEnum('credential_status', CREDENTIAL_STATUSES);

/** Shift lifecycle with distinct calendar colors (04-shifts §8). */
export const SHIFT_STATUSES = [
  'draft',
  'assigned',
  'published',
  'approved',
  'cancelled',
  'off',
] as const;
export type ShiftStatus = (typeof SHIFT_STATUSES)[number];
export const shiftStatusEnum = pgEnum('shift_status', SHIFT_STATUSES);

/** How a shift came to exist (04-shifts §3). */
export const SHIFT_SOURCES = ['manual', 'template', 'suggested'] as const;
export type ShiftSource = (typeof SHIFT_SOURCES)[number];
export const shiftSourceEnum = pgEnum('shift_source', SHIFT_SOURCES);
