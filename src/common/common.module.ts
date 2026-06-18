import { Global, Module } from '@nestjs/common';
import { PlanGuard } from './guards/plan.guard';
import { RolesGuard } from './guards/roles.guard';
import { TenantContextService } from './tenant/tenant-context.service';
import { TenantGuard } from './tenant/tenant.guard';
import { TenantInterceptor } from './tenant/tenant.interceptor';

/**
 * Cross-cutting tenancy + access primitives, exported app-wide. The
 * TenantInterceptor is registered globally in AppModule via APP_INTERCEPTOR;
 * TenantGuard / RolesGuard / PlanGuard are applied per-controller with
 * `@UseGuards(...)` alongside the global auth guard.
 */
@Global()
@Module({
  providers: [TenantContextService, TenantGuard, TenantInterceptor, RolesGuard, PlanGuard],
  exports: [TenantContextService, TenantGuard, TenantInterceptor, RolesGuard, PlanGuard],
})
export class CommonModule {}
