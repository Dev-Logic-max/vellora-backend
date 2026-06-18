import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { DatabaseService } from '../database/database.service';
import { storeActivities, stores, type Store, type StoreActivity } from '../database/schema';
import type {
  CreateActivityDto,
  CreateStoreDto,
  UpdateHoursDto,
  UpdateStoreDto,
} from './dto/store.dto';

/**
 * Tenant-scoped store CRUD. On top of RLS (company isolation), reads are
 * narrowed by the caller's scope: owner/HR see all company stores; area/store
 * managers see only the stores in their `scope_ids`.
 */
@Injectable()
export class StoresService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly tenant: TenantContextService,
  ) {}

  /** Store ids the caller may see, or null for "all company stores". */
  private scopedStoreIds(): string[] | null {
    const user = this.tenant.get()?.user;
    if (!user) return [];
    if (user.role === 'area_manager' || user.role === 'store_manager') {
      return user.scopeIds ?? [];
    }
    return null; // owner / hr → all
  }

  list(companyId: string): Promise<Store[]> {
    const ids = this.scopedStoreIds();
    if (ids && ids.length === 0) return Promise.resolve([]);
    return this.databaseService.withTenant(companyId, (tx) =>
      tx.query.stores.findMany({
        where: ids ? inArray(stores.id, ids) : undefined,
        orderBy: (s, { asc }) => asc(s.name),
      }),
    );
  }

  async get(companyId: string, id: string): Promise<Store> {
    const ids = this.scopedStoreIds();
    if (ids && !ids.includes(id)) {
      throw new ForbiddenException('That store is out of your scope.');
    }
    const store = await this.databaseService.withTenant(companyId, (tx) =>
      tx.query.stores.findFirst({ where: eq(stores.id, id) }),
    );
    if (!store) throw new NotFoundException('Store not found.');
    return store;
  }

  async create(companyId: string, dto: CreateStoreDto): Promise<Store> {
    return this.databaseService.withTenant(companyId, async (tx) => {
      const [store] = await tx
        .insert(stores)
        .values({ companyId, ...dto })
        .returning();
      return store;
    });
  }

  async update(companyId: string, id: string, dto: UpdateStoreDto): Promise<Store> {
    await this.get(companyId, id);
    return this.databaseService.withTenant(companyId, async (tx) => {
      const [store] = await tx
        .update(stores)
        .set({ ...dto })
        .where(eq(stores.id, id))
        .returning();
      return store;
    });
  }

  async archive(companyId: string, id: string): Promise<Store> {
    await this.get(companyId, id);
    return this.databaseService.withTenant(companyId, async (tx) => {
      const [store] = await tx
        .update(stores)
        .set({ status: 'archived' })
        .where(eq(stores.id, id))
        .returning();
      return store;
    });
  }

  async getHours(companyId: string, id: string): Promise<unknown> {
    const store = await this.get(companyId, id);
    return store.openingHours;
  }

  async setHours(companyId: string, id: string, dto: UpdateHoursDto): Promise<Store> {
    await this.get(companyId, id);
    return this.databaseService.withTenant(companyId, async (tx) => {
      const [store] = await tx
        .update(stores)
        .set({ openingHours: dto.openingHours })
        .where(eq(stores.id, id))
        .returning();
      return store;
    });
  }

  async listActivities(companyId: string, storeId: string): Promise<StoreActivity[]> {
    await this.get(companyId, storeId);
    return this.databaseService.withTenant(companyId, (tx) =>
      tx.query.storeActivities.findMany({ where: eq(storeActivities.storeId, storeId) }),
    );
  }

  async createActivity(
    companyId: string,
    storeId: string,
    dto: CreateActivityDto,
  ): Promise<StoreActivity> {
    await this.get(companyId, storeId);
    return this.databaseService.withTenant(companyId, async (tx) => {
      const [activity] = await tx
        .insert(storeActivities)
        .values({ companyId, storeId, ...dto })
        .returning();
      return activity;
    });
  }

  /** Paid stub (gated by @RequireEntitlement('store.finances')). */
  async finances(companyId: string, id: string) {
    await this.get(companyId, id);
    return { storeId: id, revenue: 0, laborCost: 0, target: 0, currency: 'USD', period: 'mtd' };
  }
}
