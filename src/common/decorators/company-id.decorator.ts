import { createParamDecorator, ExecutionContext, ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Injects the active tenant id from the resolved principal:
 *   `@CompanyId() companyId: string`
 * Pair with TenantGuard so a tenant context is always present (throws otherwise).
 */
export const CompanyId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<Request>();
  const companyId = request.user?.companyId;
  if (!companyId) {
    throw new ForbiddenException('No active company is associated with this request.');
  }
  return companyId;
});
