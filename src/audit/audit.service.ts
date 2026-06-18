import { Injectable } from '@nestjs/common';
import { desc } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { auditLog, type AuditEntry } from '../database/schema';

interface LogInput {
  companyId: string;
  actorUserId?: string;
  action: string;
  resource: string;
  targetId?: string;
  meta?: Record<string, unknown>;
}

/** Append-only change log, scoped per tenant (RLS on company_id). */
@Injectable()
export class AuditService {
  constructor(private readonly databaseService: DatabaseService) {}

  async log(input: LogInput): Promise<void> {
    await this.databaseService.withTenant(input.companyId, async (tx) => {
      await tx.insert(auditLog).values({
        companyId: input.companyId,
        actorUserId: input.actorUserId,
        action: input.action,
        resource: input.resource,
        targetId: input.targetId,
        meta: input.meta ?? {},
      });
    });
  }

  list(companyId: string, limit = 100): Promise<AuditEntry[]> {
    return this.databaseService.withTenant(companyId, (tx) =>
      tx.query.auditLog.findMany({ orderBy: desc(auditLog.createdAt), limit }),
    );
  }
}
