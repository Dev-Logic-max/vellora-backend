import { SetMetadata } from '@nestjs/common';
import type { PlatformRole } from '../../database/schema/enums';

export const PLATFORM_ROLES_KEY = 'platform_roles';

/**
 * Narrows a platform route to specific operator roles (super_admin always
 * passes). Without it, any platform_role is allowed:
 *   `@PlatformRoles('platform_admin')`
 */
export const PlatformRoles = (...roles: PlatformRole[]) => SetMetadata(PLATFORM_ROLES_KEY, roles);
