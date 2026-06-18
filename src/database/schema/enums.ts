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
