import { Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import {
  companies,
  platformRequests,
  users,
  type NewPlatformRequest,
  type PlatformRequest,
} from '../database/schema';

/**
 * Data access for the tenant→platform request inbox.
 *
 * - Tenant-side reads/writes go through `withTenant` (RLS scopes to the company).
 * - Platform-side reads run on the privileged connection (cross-tenant) and join
 *   the company + requester for the console table — the PlatformGuard is the gate.
 */
@Injectable()
export class PlatformRequestsRepository {
  constructor(private readonly db: DatabaseService) {}

  // ── tenant side (RLS) ────────────────────────────────────────────────────────
  create(companyId: string, values: NewPlatformRequest): Promise<PlatformRequest> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx.insert(platformRequests).values(values).returning();
      return row;
    });
  }

  listForCompany(companyId: string): Promise<PlatformRequest[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.platformRequests.findMany({
        where: eq(platformRequests.companyId, companyId),
        orderBy: desc(platformRequests.createdAt),
      }),
    );
  }

  /** Does this company already have an open deletion request? (avoid dupes) */
  findOpenByType(companyId: string, type: string): Promise<PlatformRequest | undefined> {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.platformRequests.findFirst({
        where: (r, { and, eq: eqf, notInArray }) =>
          and(
            eqf(r.companyId, companyId),
            eqf(r.type, type),
            notInArray(r.status, ['resolved', 'rejected']),
          ),
      }),
    );
  }

  // ── platform side (privileged, cross-tenant) ──────────────────────────────────
  async listAll(): Promise<
    (PlatformRequest & { companyName: string | null; requesterName: string | null })[]
  > {
    const rows = await this.db.db
      .select({
        request: platformRequests,
        companyName: companies.name,
        requesterName: users.name,
      })
      .from(platformRequests)
      .leftJoin(companies, eq(companies.id, platformRequests.companyId))
      .leftJoin(users, eq(users.id, platformRequests.requestedBy))
      .orderBy(desc(platformRequests.createdAt))
      .limit(500);
    return rows.map((r) => ({
      ...r.request,
      companyName: r.companyName,
      requesterName: r.requesterName,
    }));
  }

  getById(id: string): Promise<PlatformRequest | undefined> {
    return this.db.db.query.platformRequests.findFirst({
      where: eq(platformRequests.id, id),
    });
  }

  async update(id: string, patch: Partial<NewPlatformRequest>): Promise<PlatformRequest> {
    const [row] = await this.db.db
      .update(platformRequests)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(platformRequests.id, id))
      .returning();
    return row;
  }
}
