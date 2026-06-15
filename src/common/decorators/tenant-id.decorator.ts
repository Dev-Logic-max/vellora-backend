import { createParamDecorator, ExecutionContext, ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Injects the active tenant id from the authenticated principal:
 *   `@TenantId() companyId: string`
 * Pair with TenantGuard so this is always present.
 */
export const TenantId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<Request>();
  const companyId = request.user?.companyId;
  if (!companyId) {
    throw new ForbiddenException('No tenant is associated with this request.');
  }
  return companyId;
});
