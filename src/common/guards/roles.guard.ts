import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { MembershipRole } from '../../database/schema/enums';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Enforces `@Roles(...)`. Runs after the auth guard, so `req.user.role` (the
 * active tenant role) is set. Routes without `@Roles` are unrestricted by role.
 *
 * Note: this checks the role of the ACTIVE membership only; scope (which
 * records within the company) is enforced per-resource in services + RLS.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<MembershipRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    // Platform operators bypass company role gates — they act with full
    // owner-equivalent authority in whichever company they're scoped to.
    if (request.user?.platformRole) {
      return true;
    }
    const role = request.user?.role;
    if (!role || !required.includes(role)) {
      throw new ForbiddenException('Your role does not permit this action.');
    }
    return true;
  }
}
