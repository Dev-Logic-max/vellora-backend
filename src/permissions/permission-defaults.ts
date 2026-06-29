import type { MembershipRole } from '../database/schema/enums';

/**
 * Module keys the permission matrix toggles (roles × modules). Per-action
 * overrides are a later (Business+) refinement; Phase 1 is module-level.
 */
export const MODULES = [
  'dashboard',
  'companies',
  'stores',
  'offices',
  'factories',
  'employees',
  'shifts',
  'attendance',
  'leave',
  'onboarding',
  'documents',
  'reports',
  'messaging',
  'notifications',
  'settings',
  'billing',
  'recruiting',
  'pos_products',
  'pos_sales',
] as const;
export type ModuleKey = (typeof MODULES)[number];

/** The action stored for module-level access. */
export const ACCESS = 'access';

const MANAGER_MODULES: ModuleKey[] = [
  'dashboard',
  'stores',
  'offices',
  'factories',
  'employees',
  'shifts',
  'attendance',
  'leave',
  'onboarding',
  'documents',
  'reports',
  'messaging',
  'notifications',
  'pos_products',
  'pos_sales',
];

const EMPLOYEE_MODULES: ModuleKey[] = [
  'dashboard',
  'shifts',
  'attendance',
  'leave',
  'onboarding',
  'documents',
  'messaging',
  'notifications',
];

/** Default role → allowed modules (roles-and-access.md §9). Owner = everything. */
export const DEFAULT_MODULE_ACCESS: Record<MembershipRole, ReadonlySet<ModuleKey>> = {
  owner: new Set(MODULES),
  hr: new Set(MODULES.filter((m) => m !== 'billing')),
  area_manager: new Set(MANAGER_MODULES),
  store_manager: new Set(MANAGER_MODULES),
  employee: new Set(EMPLOYEE_MODULES),
};

export function defaultAllows(role: MembershipRole, moduleKey: string): boolean {
  return DEFAULT_MODULE_ACCESS[role]?.has(moduleKey as ModuleKey) ?? false;
}
