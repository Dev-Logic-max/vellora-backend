import { Global, Module } from '@nestjs/common';
import { TenantContextService } from './tenant/tenant-context.service';
import { TenantGuard } from './tenant/tenant.guard';
import { TenantInterceptor } from './tenant/tenant.interceptor';

/**
 * Cross-cutting tenancy primitives, exported app-wide. The TenantInterceptor is
 * registered globally in AppModule via APP_INTERCEPTOR; TenantGuard is applied
 * per-controller alongside the auth guard.
 */
@Global()
@Module({
  providers: [TenantContextService, TenantGuard, TenantInterceptor],
  exports: [TenantContextService, TenantGuard, TenantInterceptor],
})
export class CommonModule {}
