import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type postgres from 'postgres';
import type * as schema from './schema';

/** Raw postgres.js client type (the package uses `export =`, hence this alias). */
export type PgClient = postgres.Sql;

/** Schema-aware Drizzle database type. Inject with `@Inject(DRIZZLE)`. */
export type DrizzleDB = PostgresJsDatabase<typeof schema>;

/** Drizzle transaction handle (same query surface as DrizzleDB). */
export type DrizzleTx = Parameters<Parameters<DrizzleDB['transaction']>[0]>[0];
