import { pgEnum } from 'drizzle-orm/pg-core';

/**
 * Application-wide role hierarchy. Ordering (broadest → narrowest authority)
 * is meaningful and mirrors the access model used by the frontend.
 */
export const USER_ROLES = [
  'super_admin',
  'admin',
  'hr',
  'area_manager',
  'store_manager',
  'employee',
  'store_terminal',
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const userRoleEnum = pgEnum('user_role', USER_ROLES);
