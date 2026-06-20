import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { PlatformRole } from '../../database/schema/enums';
import { PLATFORM_ROLES_KEY } from '../decorators/platform-roles.decorator';

/**
 * Gates the platform console (`/admin`). The caller must hold a `platform_role`
 * (cross-tenant operator) — and, when `@PlatformRoles(...)` narrows it, one of
 * the listed roles. Tenant users (no platform role) are fully blocked (403).
 * These routes legitimately bypass tenant RLS; this guard is their gate.
 */
@Injectable()
export class PlatformGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<Request>().user;
    const role = user?.platformRole;
    if (!role) {
      throw new ForbiddenException('Platform access required.');
    }
    const required = this.reflector.getAllAndOverride<PlatformRole[] | undefined>(
      PLATFORM_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    // super_admin always passes; otherwise the role must be in the allow-list.
    if (required && required.length > 0 && role !== 'super_admin' && !required.includes(role)) {
      throw new ForbiddenException('Insufficient platform role.');
    }
    return true;
  }
}
