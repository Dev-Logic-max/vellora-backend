import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { TenantContextService } from './tenant-context.service';

/**
 * Opens an AsyncLocalStorage tenant scope for the duration of each request that
 * carries an authenticated user, so downstream services can read the active
 * `companyId` via TenantContextService without passing it explicitly.
 *
 * Requests without an active tenant (`req.user.companyId`) — the public
 * /health endpoint, or a freshly signed-up user with no membership — pass
 * through untouched.
 *
 * RLS itself is applied per query, transaction-locally, in
 * DatabaseService.withTenant (SET LOCAL ROLE + tenant GUC) — safe with the
 * Supabase transaction pooler. This interceptor just makes the active
 * `companyId` ambiently available so services don't thread it through args.
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
    const companyId = user.companyId;

    // The route handler runs when the returned observable is subscribed, which
    // happens after `intercept` returns. Subscribing to `next.handle()` *inside*
    // `als.run` is what keeps the tenant store active during that execution.
    return new Observable((subscriber) => {
      this.tenantContext.run({ companyId, user }, () => {
        next.handle().subscribe(subscriber);
      });
    });
  }
}
