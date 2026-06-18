import { Injectable } from '@nestjs/common';
import { ilike, inArray, or } from 'drizzle-orm';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { DatabaseService } from '../database/database.service';
import { companies, stores } from '../database/schema';

export interface SearchResult {
  type: 'company' | 'store' | 'employee';
  id: string;
  label: string;
  href: string;
}

/**
 * Super-search across the caller's tenant + scope (10-permissions §6). Uses
 * ILIKE for Phase 1; everything runs inside `withTenant`, so RLS guarantees
 * only in-scope rows are ever returned. Employees arrive in Phase 2.
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly tenant: TenantContextService,
  ) {}

  async search(companyId: string, query: string, types?: string[]): Promise<SearchResult[]> {
    const q = query.trim();
    if (q.length < 1) return [];
    const pattern = `%${q}%`;
    const want = (type: string) => !types || types.length === 0 || types.includes(type);
    const results: SearchResult[] = [];

    await this.databaseService.withTenant(companyId, async (tx) => {
      if (want('company')) {
        const rows = await tx
          .select()
          .from(companies)
          .where(ilike(companies.name, pattern))
          .limit(5);
        results.push(
          ...rows.map((c) => ({
            type: 'company' as const,
            id: c.id,
            label: c.name,
            href: `/companies/${c.id}`,
          })),
        );
      }

      if (want('store')) {
        const scopeIds = this.scopedStoreIds();
        if (!(scopeIds && scopeIds.length === 0)) {
          const where = scopeIds
            ? inArray(stores.id, scopeIds)
            : or(ilike(stores.name, pattern), ilike(stores.code, pattern));
          const rows = await tx.select().from(stores).where(where).limit(8);
          const matched = scopeIds
            ? rows.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()))
            : rows;
          results.push(
            ...matched.map((s) => ({
              type: 'store' as const,
              id: s.id,
              label: s.name,
              href: `/stores/${s.id}`,
            })),
          );
        }
      }
    });

    return results;
  }

  private scopedStoreIds(): string[] | null {
    const user = this.tenant.get()?.user;
    if (!user) return [];
    if (user.role === 'area_manager' || user.role === 'store_manager') {
      return user.scopeIds ?? [];
    }
    return null;
  }
}
