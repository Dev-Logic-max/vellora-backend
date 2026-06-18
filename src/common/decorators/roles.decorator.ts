import { SetMetadata } from '@nestjs/common';
import type { MembershipRole } from '../../database/schema/enums';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route to one or more tenant roles, enforced by RolesGuard:
 *   `@Roles('owner', 'hr')`
 */
export const Roles = (...roles: MembershipRole[]) => SetMetadata(ROLES_KEY, roles);
