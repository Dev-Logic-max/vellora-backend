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

    if (!user.companyId) {
      throw new ForbiddenException('Authenticated user is not associated with a company.');
    }

    return true;
  }
}
