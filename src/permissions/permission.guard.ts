import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import {
  REQUIRE_PERMISSION_KEY,
  type RequiredPermission,
} from '../common/decorators/require-permission.decorator';
import { PermissionsService } from './permissions.service';

/**
 * Enforces `@RequirePermission(...)`: resolves the effective permission for the
 * caller's active role + company (override ∨ default). Scope (which records) is
 * enforced per-resource in services + RLS.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<RequiredPermission | undefined>(
      REQUIRE_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    const user = context.switchToHttp().getRequest<Request>().user;
    if (!user?.companyId || !user.role) {
      throw new ForbiddenException('No active company role for this request.');
    }

    const allowed = await this.permissionsService.can(
      user.companyId,
      user.role,
      required.resource,
      required.action,
    );
    if (!allowed) {
      throw new ForbiddenException(`Missing permission: ${required.resource}.${required.action}`);
    }
    return true;
  }
}
