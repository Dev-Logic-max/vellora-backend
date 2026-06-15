import { Global, Inject, Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { AppConfig } from '../config/configuration';
import { DRIZZLE, PG_CONNECTION } from './database.constants';
import type { PgClient } from './drizzle.types';
import * as schema from './schema';

/**
 * Provides the postgres.js client and a schema-aware Drizzle instance app-wide.
 *
 * postgres.js connects lazily (no socket is opened until the first query), so
 * importing this module never blocks boot even if the database is unreachable —
 * exactly what we want for `start:dev` against a placeholder DATABASE_URL.
 */
@Global()
@Module({
  providers: [
    {
      provide: PG_CONNECTION,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>): PgClient => {
        const url = config.get('database.url', { infer: true });
        return postgres(url, {
          // Keep the pool small for the API; tune per-deployment later.
          max: 10,
          // Required by Supabase's transaction pooler (pgbouncer).
          prepare: false,
          onnotice: () => {},
        });
      },
    },
    {
      provide: DRIZZLE,
      inject: [PG_CONNECTION],
      useFactory: (client: PgClient) =>
        drizzle(client, { schema, casing: 'snake_case', logger: false }),
    },
  ],
  exports: [DRIZZLE, PG_CONNECTION],
})
export class DatabaseModule implements OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseModule.name);

  constructor(@Inject(PG_CONNECTION) private readonly client: PgClient) {}

  async onApplicationShutdown(): Promise<void> {
    try {
      await this.client.end({ timeout: 5 });
    } catch (error) {
      this.logger.warn(`Error while closing the database connection: ${String(error)}`);
    }
  }
}
