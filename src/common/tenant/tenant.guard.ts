import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Asserts that the authenticated principal carries a tenant (`companyId`).
 * Must run AFTER the auth guard that populates `req.user`. Any controller it
 * protects is guaranteed a tenant boundary for its queries.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication is required to resolve a tenant.');
    }

    // Platform operators (super_admin / platform_admin / operations) are
    // authorized cross-tenant — they never get a "not associated with a company"
    // 403. They normally carry an active company (the x-company-id they picked,
    // adopted in AuthService) which scopes the query; without one, downstream
    // tenant-scoped reads simply return nothing rather than erroring.
    if (user.platformRole) {
      return true;
    }

    if (!user.companyId) {
      throw new ForbiddenException('Authenticated user is not associated with a company.');
    }

    return true;
  }
}
