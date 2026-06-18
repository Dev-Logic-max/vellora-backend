import { CanActivate, Injectable } from '@nestjs/common';

/**
 * Plan-entitlement gate — STUB. Allows everything for now.
 *
 * TODO(Phase 1): resolve the active company's plan, read `entitlements_json`,
 * and enforce `@RequireEntitlement('<feature>')` metadata so paid modules are
 * gated by subscription. Effective access = plan ∧ role (RolesGuard) ∧ scope.
 */
@Injectable()
export class PlanGuard implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}
