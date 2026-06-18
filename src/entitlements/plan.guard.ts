import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { REQUIRE_ENTITLEMENT_KEY } from '../common/decorators/require-entitlement.decorator';
import { EntitlementsService } from './entitlements.service';

/**
 * Enforces `@RequireEntitlement(feature)`: the active company's plan must unlock
 * the feature. Effective access = plan (here) ∧ permission ∧ scope.
 */
@Injectable()
export class PlanGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlementsService: EntitlementsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<string | undefined>(REQUIRE_ENTITLEMENT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!feature) return true;

    const user = context.switchToHttp().getRequest<Request>().user;
    if (!user?.companyId) {
      throw new ForbiddenException('No active company for this request.');
    }

    if (!(await this.entitlementsService.has(user.companyId, feature))) {
      throw new ForbiddenException(
        `Your plan does not include "${feature}". Upgrade to unlock it.`,
      );
    }
    return true;
  }
}
