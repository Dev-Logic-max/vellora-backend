import { sql } from 'drizzle-orm';
import type { SeedContext } from '../seed-context';

/**
 * Full tenant-data wipe (keeps schema/migrations + the plan catalogue). Truncates
 * all company-scoped tables via CASCADE from `companies`, plus the workplace and
 * platform tables, and deletes the app `users` rows. Auth users are cleaned
 * separately by the caller (needs the GoTrue admin API).
 */
export async function wipeTenantData(ctx: SeedContext): Promise<void> {
  const { db, log } = ctx;
  log('→ wiping tenant data…');
  // CASCADE from companies clears every company_id-scoped table. Groups + the
  // platform tables aren't FK-children of companies, so truncate them too.
  await db.execute(sql`
    TRUNCATE TABLE
      companies,
      groups,
      users,
      offices,
      factories,
      activation_requests,
      platform_requests,
      platform_audit_log,
      platform_admins,
      platform_signups
    RESTART IDENTITY CASCADE;
  `);
}
