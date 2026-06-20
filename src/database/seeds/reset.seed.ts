/**
 * Reset seed: deletes the demo company and its data (ON DELETE cascade clears
 * stores/employees/leave/onboarding/transfers/etc). Leaves the global `users`
 * rows and the Supabase Auth accounts in place so re-seeding is fast.
 *
 *   npm run db:seed -- reset
 *
 * Only ever targets the named demo company — never a real tenant.
 */
import { eq } from 'drizzle-orm';
import type { SeedContext, SeedModule } from './seed-context';

const COMPANY_NAME = 'Vellora Demo Co';

async function run(ctx: SeedContext): Promise<void> {
  const { db, schema, log } = ctx;
  const company = await db.query.companies.findFirst({
    where: eq(schema.companies.name, COMPANY_NAME),
  });
  if (!company) {
    log(`Nothing to reset — "${COMPANY_NAME}" not found.`);
    return;
  }
  await db.delete(schema.companies).where(eq(schema.companies.id, company.id));
  log(`✅ Deleted "${COMPANY_NAME}" and all its tenant data (cascade).`);
}

const resetSeed: SeedModule = {
  name: 'reset',
  description: 'Delete the demo company and all its tenant data (cascade). Safe — demo only.',
  seed: run,
};

export default resetSeed;
