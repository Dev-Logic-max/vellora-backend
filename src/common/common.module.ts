import { Global, Module } from '@nestjs/common';
import { RolesGuard } from './guards/roles.guard';
import { TenantContextService } from './tenant/tenant-context.service';
import { TenantGuard } from './tenant/tenant.guard';
import { TenantInterceptor } from './tenant/tenant.interceptor';

/**
 * Cross-cutting tenancy + access primitives, exported app-wide. The
 * TenantInterceptor is registered globally in AppModule via APP_INTERCEPTOR;
 * TenantGuard / RolesGuard are applied per-controller with `@UseGuards(...)`
 * alongside the global auth guard. (PlanGuard lives in EntitlementsModule;
 * PermissionGuard in PermissionsModule.)
 */
@Global()
@Module({
  providers: [TenantContextService, TenantGuard, TenantInterceptor, RolesGuard],
  exports: [TenantContextService, TenantGuard, TenantInterceptor, RolesGuard],
})
export class CommonModule {}
