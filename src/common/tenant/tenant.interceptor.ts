import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { TenantContextService } from './tenant-context.service';

/**
 * Opens an AsyncLocalStorage tenant scope for the duration of each request that
 * carries an authenticated user, so downstream services can read the active
 * `companyId` via TenantContextService without passing it explicitly.
 *
 * Requests without a `req.user` (e.g. the public /health endpoint) pass through
 * untouched.
 *
 * Placeholder for RLS: this is also where a transaction-local Postgres GUC
 * (`SET LOCAL app.current_company_id = ...`) would be set once DB-level RLS is
 * enabled — see src/database/rls/policies.sql.
 */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  constructor(private readonly tenantContext: TenantContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;

    if (!user?.companyId) {
      return next.handle();
    }

    // The route handler runs when the returned observable is subscribed, which
    // happens after `intercept` returns. Subscribing to `next.handle()` *inside*
    // `als.run` is what keeps the tenant store active during that execution.
    return new Observable((subscriber) => {
      this.tenantContext.run({ companyId: user.companyId, user }, () => {
        next.handle().subscribe(subscriber);
      });
    });
  }
}
