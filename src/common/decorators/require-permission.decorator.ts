import { SetMetadata } from '@nestjs/common';
import { ACCESS } from '../../permissions/permission-defaults';

export const REQUIRE_PERMISSION_KEY = 'require_permission';

export interface RequiredPermission {
  resource: string;
  action: string;
}

/**
 * Gate a route on the effective permission for the caller's active role:
 *   `@RequirePermission('stores')`            // module access
 *   `@RequirePermission('stores', 'update')`  // resource.action (future-proof)
 * Enforced by PermissionGuard (entitlement ∧ permission ∧ scope).
 */
export const RequirePermission = (resource: string, action: string = ACCESS) =>
  SetMetadata(REQUIRE_PERMISSION_KEY, { resource, action } satisfies RequiredPermission);
