/**
 * Seed runner. Pick a seed by name and run it against the database.
 *
 *   npm run db:seed                 # default seed (basic)
 *   npm run db:seed -- basic        # by name (CLI arg)
 *   npm run db:seed -- reset        # another registered seed
 *   npm run db:seed -- --list       # list available seeds
 *   SEED_FILE=basic npm run db:seed # by env var
 *
 * Safety: refuses to run unless SEED_ENABLED=true in the environment, so it can
 * never fire by accident (e.g. against a non-dev database).
 *
 * To add a seed: create `<name>.seed.ts` exporting a default SeedModule and
 * register it in SEEDS below.
 */
import 'dotenv/config';
import basicSeed from './basic.seed';
import resetSeed from './reset.seed';
import { createSeedContext, type SeedModule } from './seed-context';

const SEEDS: Record<string, SeedModule> = {
  [basicSeed.name]: basicSeed,
  [resetSeed.name]: resetSeed,
};

const DEFAULT_SEED = 'basic';

function listSeeds(): void {
  console.log('Available seeds:');
  for (const s of Object.values(SEEDS)) console.log(`  • ${s.name.padEnd(10)} ${s.description}`);
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (arg === '--list' || arg === '-l') {
    listSeeds();
    return;
  }

  if (process.env.SEED_ENABLED !== 'true') {
    console.error(
      'Refusing to seed: set SEED_ENABLED=true in your environment to allow seeding.\n' +
        'Example: SEED_ENABLED=true npm run db:seed',
    );
    process.exit(1);
  }

  const requested = arg && !arg.startsWith('-') ? arg : (process.env.SEED_FILE ?? DEFAULT_SEED);
  const seed = SEEDS[requested];
  if (!seed) {
    console.error(`Unknown seed "${requested}".`);
    listSeeds();
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');

  const { ctx, close } = createSeedContext({
    databaseUrl,
    supabaseUrl: process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  console.log(`▶ Running seed: ${seed.name}`);
  try {
    await seed.seed(ctx);
    console.log(`\n✅ Seed "${seed.name}" complete.`);
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});
