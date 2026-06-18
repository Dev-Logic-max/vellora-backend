import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { APP_DB_ROLE, DRIZZLE, TENANT_GUC } from './database.constants';
import type { DrizzleDB, DrizzleTx } from './drizzle.types';

/**
 * Two ways to reach the database, by design:
 *
 * - `db` — the privileged connection (the runtime role bypasses RLS). Use ONLY
 *   for cross-tenant/platform work that legitimately spans tenants: resolving a
 *   principal at auth time, company+owner provisioning at signup, health pings.
 *
 * - `withTenant(companyId, work)` — opens a transaction, assumes the built-in
 *   NOBYPASSRLS `authenticated` role and sets the tenant GUC, so Postgres RLS
 *   filters every query to `companyId`. Use for ALL ordinary tenant-scoped
 *   reads/writes. This is the real isolation gate — defense-in-depth beneath the
 *   app-level guards.
 *
 * The GUC is set transaction-locally (not on the shared pooled connection), so
 * it is safe with Supabase's transaction pooler and never leaks across requests.
 */
@Injectable()
export class DatabaseService {
  constructor(@Inject(DRIZZLE) private readonly drizzle: DrizzleDB) {}

  /** Privileged, NON-RLS-scoped handle. Cross-tenant use only. */
  get db(): DrizzleDB {
    return this.drizzle;
  }

  /** Runs `work` with RLS enforced for `companyId`. */
  async withTenant<T>(companyId: string, work: (tx: DrizzleTx) => Promise<T>): Promise<T> {
    return this.drizzle.transaction(async (tx) => {
      // Role name is a trusted constant — never interpolate user input here.
      await tx.execute(sql.raw(`SET LOCAL ROLE ${APP_DB_ROLE}`));
      await tx.execute(sql`SELECT set_config(${TENANT_GUC}, ${companyId}, true)`);
      return work(tx);
    });
  }
}
