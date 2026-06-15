import { Controller, Get, Inject } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { PG_CONNECTION } from '../database/database.constants';
import type { PgClient } from '../database/drizzle.types';

interface HealthResponse {
  status: 'ok' | 'degraded';
  service: string;
  timestamp: string;
  uptimeSeconds: number;
  database: 'up' | 'down';
}

/**
 * Public liveness/readiness probe. Pings the database but never fails the whole
 * response on a DB outage — it reports `degraded`/`database: down` instead, so
 * the endpoint stays useful for diagnosing connectivity.
 */
@Controller('health')
export class HealthController {
  constructor(@Inject(PG_CONNECTION) private readonly sql: PgClient) {}

  @Public()
  @Get()
  async check(): Promise<HealthResponse> {
    const database = await this.pingDatabase();
    return {
      status: database === 'up' ? 'ok' : 'degraded',
      service: 'vellora-backend',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      database,
    };
  }

  private async pingDatabase(): Promise<'up' | 'down'> {
    try {
      await this.sql`SELECT 1`;
      return 'up';
    } catch {
      return 'down';
    }
  }
}
