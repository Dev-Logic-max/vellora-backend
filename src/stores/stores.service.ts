import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { BillingService } from '../billing/billing.service';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { DatabaseService } from '../database/database.service';
import {
  employees,
  storeActivities,
  stores,
  type Store,
  type StoreActivity,
} from '../database/schema';
import type {
  CreateActivityDto,
  CreateStoreDto,
  UpdateHoursDto,
  UpdateStoreDto,
} from './dto/store.dto';

/** A store row enriched with directory aggregates for the list/cards views. */
export type StoreWithStats = Store & {
  employeeCount: number;
  employeeAvatars: { name: string; avatarUrl: string | null }[];
};

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
    private readonly billing: BillingService,
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

  async list(companyId: string): Promise<StoreWithStats[]> {
    const ids = this.scopedStoreIds();
    if (ids && ids.length === 0) return [];
    return this.databaseService.withTenant(companyId, async (tx) => {
      const rows = await tx.query.stores.findMany({
        where: ids ? inArray(stores.id, ids) : undefined,
        orderBy: (s, { asc }) => asc(s.name),
      });
      if (rows.length === 0) return [];
      // One batched read of (non-archived) employees, bucketed by primary store.
      const emps = await tx.query.employees.findMany({
        where: and(ne(employees.status, 'archived')),
        columns: { primaryStoreId: true, firstName: true, lastName: true, avatarUrl: true },
      });
      const byStore = new Map<string, { name: string; avatarUrl: string | null }[]>();
      for (const e of emps) {
        if (!e.primaryStoreId) continue;
        const list = byStore.get(e.primaryStoreId) ?? [];
        list.push({ name: `${e.firstName} ${e.lastName}`.trim(), avatarUrl: e.avatarUrl });
        byStore.set(e.primaryStoreId, list);
      }
      return rows.map((s) => {
        const people = byStore.get(s.id) ?? [];
        return { ...s, employeeCount: people.length, employeeAvatars: people.slice(0, 4) };
      });
    });
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
    await this.billing.assertWithinLimit(companyId, 'stores');
    const code = dto.code?.trim() || (await this.generateUniqueCode(companyId));
    return this.databaseService.withTenant(companyId, async (tx) => {
      const [store] = await tx
        .insert(stores)
        .values({ companyId, ...dto, code })
        .returning();
      return store;
    });
  }

  async update(companyId: string, id: string, dto: UpdateStoreDto): Promise<Store> {
    const current = await this.get(companyId, id);
    // settings is shallow-merged so partial config saves don't wipe other keys.
    const settings = dto.settings
      ? { ...(current.settings as Record<string, unknown>), ...dto.settings }
      : undefined;
    return this.databaseService.withTenant(companyId, async (tx) => {
      const [store] = await tx
        .update(stores)
        .set({ ...dto, ...(settings ? { settings } : {}) })
        .where(eq(stores.id, id))
        .returning();
      return store;
    });
  }

  /** Auto store code: 6 digits, retried against the company's existing codes. */
  private async generateUniqueCode(companyId: string): Promise<string> {
    const existing = await this.databaseService.withTenant(companyId, (tx) =>
      tx.query.stores.findMany({ columns: { code: true } }),
    );
    const taken = new Set(existing.map((s) => s.code).filter(Boolean));
    for (let i = 0; i < 30; i++) {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      if (!taken.has(code)) return code;
    }
    return String(Date.now()).slice(-6);
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

  /**
   * Store analytics — deterministic MOCK figures (revenue/profit/visitors/peak
   * hours/labor) seeded from the store id so the numbers stay stable per store.
   * Stands in for the future POS/finance integration; the shape is real so the
   * UI and wiring don't change when live data lands.
   */
  async analytics(companyId: string, id: string) {
    const store = await this.get(companyId, id);
    const settings = (store.settings ?? {}) as { currency?: string; monthlyTarget?: number };
    const seed = [...id].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7);
    const rng = (() => {
      let s = seed || 1;
      return () => {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return s / 0x7fffffff;
      };
    })();

    const revenueMtd = Math.round(18000 + rng() * 90000);
    const marginPct = 0.18 + rng() * 0.22;
    const profitMtd = Math.round(revenueMtd * marginPct);
    const laborCost = Math.round(revenueMtd * (0.18 + rng() * 0.1));
    const visitorsMtd = Math.round(1200 + rng() * 9000);
    const target = settings.monthlyTarget || Math.round(revenueMtd * (0.9 + rng() * 0.5));

    const trend = Array.from({ length: 12 }, (_, i) => {
      const base = revenueMtd / 12;
      return {
        month: i,
        revenue: Math.round(base * (0.6 + rng() * 0.9)),
        profit: Math.round(base * marginPct * (0.5 + rng())),
        visitors: Math.round((visitorsMtd / 12) * (0.6 + rng() * 0.9)),
      };
    });

    // Hourly visitor curve (08:00–22:00) with a couple of peaks.
    const hours = Array.from({ length: 15 }, (_, i) => {
      const hour = 8 + i;
      const lunch = Math.exp(-((hour - 13) ** 2) / 6);
      const evening = Math.exp(-((hour - 18) ** 2) / 5);
      const traffic = Math.round((0.3 + lunch * 0.8 + evening + rng() * 0.2) * 60);
      return { hour, traffic };
    });
    const peak = [...hours]
      .sort((a, b) => b.traffic - a.traffic)
      .slice(0, 2)
      .map((h) => h.hour);

    return {
      storeId: id,
      currency: settings.currency || 'USD',
      period: 'mtd',
      revenueMtd,
      profitMtd,
      marginPct: Math.round(marginPct * 100),
      laborCost,
      visitorsMtd,
      target,
      revenueChangePct: Math.round((rng() * 40 - 12) * 10) / 10,
      profitChangePct: Math.round((rng() * 36 - 10) * 10) / 10,
      visitorsChangePct: Math.round((rng() * 30 - 8) * 10) / 10,
      shiftsThisWeek: Math.round(8 + rng() * 28),
      hoursScheduled: Math.round(120 + rng() * 240),
      avgBasket: Math.round((revenueMtd / Math.max(visitorsMtd, 1)) * 100) / 100,
      trend,
      hourly: hours,
      peakHours: peak,
    };
  }
}
