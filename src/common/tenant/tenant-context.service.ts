import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../types/authenticated-user';

export interface TenantStore {
  companyId: string;
  user: AuthenticatedUser;
}

/**
 * Request-scoped tenant context backed by AsyncLocalStorage. The
 * TenantInterceptor opens a store per request; services anywhere in the call
 * graph can read the active `companyId` without threading it through args.
 */
@Injectable()
export class TenantContextService {
  private readonly als = new AsyncLocalStorage<TenantStore>();

  run<T>(store: TenantStore, callback: () => T): T {
    return this.als.run(store, callback);
  }

  /** The active store, or undefined outside of a request (e.g. on boot). */
  get(): TenantStore | undefined {
    return this.als.getStore();
  }

  /** Active tenant id; throws if read outside a tenant-scoped request. */
  getCompanyId(): string {
    const store = this.als.getStore();
    if (!store) {
      throw new Error('Tenant context is not available outside of a request scope.');
    }
    return store.companyId;
  }
}
