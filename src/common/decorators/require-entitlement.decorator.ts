import { SetMetadata } from '@nestjs/common';

export const REQUIRE_ENTITLEMENT_KEY = 'require_entitlement';

/**
 * Gate a route on a plan entitlement feature flag:
 *   `@RequireEntitlement('store.finances')`
 * Enforced by PlanGuard against the company's effective entitlements.
 */
export const RequireEntitlement = (feature: string) =>
  SetMetadata(REQUIRE_ENTITLEMENT_KEY, feature);
