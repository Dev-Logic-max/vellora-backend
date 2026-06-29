import { Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import {
  productCategories,
  products,
  type Product,
  type ProductCategory,
} from '../database/schema';
import { StoresService } from './stores.service';
import type {
  AdjustStockDto,
  CreateProductCategoryDto,
  CreateProductDto,
  UpdateProductDto,
} from './dto/product.dto';

/**
 * POS — the necessary product-management subset (the full register/checkout POS
 * plan comes later). Tenant-scoped via RLS + StoresService scope checks. Sales
 * figures are MOCK (seeded by store id) until the checkout module lands.
 */
@Injectable()
export class PosService {
  constructor(
    private readonly db: DatabaseService,
    private readonly stores: StoresService,
  ) {}

  // ── categories ────────────────────────────────────────────────────────────
  async listCategories(companyId: string, storeId: string): Promise<ProductCategory[]> {
    await this.stores.get(companyId, storeId);
    return this.db.withTenant(companyId, (tx) =>
      tx.query.productCategories.findMany({
        where: eq(productCategories.storeId, storeId),
        orderBy: (c, { asc }) => asc(c.name),
      }),
    );
  }

  async createCategory(
    companyId: string,
    storeId: string,
    dto: CreateProductCategoryDto,
  ): Promise<ProductCategory> {
    await this.stores.get(companyId, storeId);
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx
        .insert(productCategories)
        .values({ companyId, storeId, name: dto.name, color: dto.color ?? '#6366f1' })
        .returning();
      return row;
    });
  }

  async deleteCategory(companyId: string, storeId: string, id: string): Promise<{ id: string }> {
    await this.stores.get(companyId, storeId);
    await this.db.withTenant(companyId, (tx) =>
      tx
        .delete(productCategories)
        .where(and(eq(productCategories.id, id), eq(productCategories.storeId, storeId))),
    );
    return { id };
  }

  // ── products ──────────────────────────────────────────────────────────────
  async listProducts(companyId: string, storeId: string): Promise<Product[]> {
    await this.stores.get(companyId, storeId);
    return this.db.withTenant(companyId, (tx) =>
      tx.query.products.findMany({
        where: eq(products.storeId, storeId),
        orderBy: (p, { desc }) => desc(p.createdAt),
      }),
    );
  }

  async createProduct(companyId: string, storeId: string, dto: CreateProductDto): Promise<Product> {
    await this.stores.get(companyId, storeId);
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx
        .insert(products)
        .values({
          companyId,
          storeId,
          name: dto.name,
          sku: dto.sku,
          categoryId: dto.categoryId,
          price: dto.price != null ? String(dto.price) : '0',
          currency: dto.currency ?? 'USD',
          stock: dto.stock ?? 0,
          lowStockThreshold: dto.lowStockThreshold ?? 5,
          imageUrl: dto.imageUrl,
          status: dto.status ?? 'active',
        })
        .returning();
      return row;
    });
  }

  async updateProduct(
    companyId: string,
    storeId: string,
    id: string,
    dto: UpdateProductDto,
  ): Promise<Product> {
    await this.stores.get(companyId, storeId);
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx
        .update(products)
        .set({
          ...dto,
          price: dto.price != null ? String(dto.price) : undefined,
        })
        .where(and(eq(products.id, id), eq(products.storeId, storeId)))
        .returning();
      if (!row) throw new NotFoundException('Product not found.');
      return row;
    });
  }

  async adjustStock(
    companyId: string,
    storeId: string,
    id: string,
    dto: AdjustStockDto,
  ): Promise<Product> {
    await this.stores.get(companyId, storeId);
    return this.db.withTenant(companyId, async (tx) => {
      const product = await tx.query.products.findFirst({
        where: and(eq(products.id, id), eq(products.storeId, storeId)),
      });
      if (!product) throw new NotFoundException('Product not found.');
      const next = Math.max(0, product.stock + dto.delta);
      const [row] = await tx
        .update(products)
        .set({ stock: next })
        .where(eq(products.id, id))
        .returning();
      return row;
    });
  }

  async deleteProduct(companyId: string, storeId: string, id: string): Promise<{ id: string }> {
    await this.stores.get(companyId, storeId);
    await this.db.withTenant(companyId, (tx) =>
      tx.delete(products).where(and(eq(products.id, id), eq(products.storeId, storeId))),
    );
    return { id };
  }

  // ── company-wide (standalone POS modules) ──────────────────────────────────
  /** All products across the company's stores (joined with store name). */
  async companyProducts(companyId: string) {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.products.findMany({
        with: { store: { columns: { name: true, code: true } } },
        orderBy: (p, { desc }) => desc(p.createdAt),
      }),
    );
  }

  /** Aggregated mock sales across all the company's stores. */
  async companySales(companyId: string) {
    const stores = await this.db.withTenant(companyId, (tx) =>
      tx.query.stores.findMany({ columns: { id: true, name: true } }),
    );
    const perStore = await Promise.all(
      stores.map(async (s) => {
        const sales = await this.sales(companyId, s.id);
        return { ...sales, storeName: s.name };
      }),
    );
    const totalRevenue = perStore.reduce((a, s) => a + s.revenueToday, 0);
    const totalOrders = perStore.reduce((a, s) => a + s.ordersToday, 0);
    return {
      currency: perStore[0]?.currency ?? 'USD',
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalOrders,
      avgOrderValue: totalOrders > 0 ? Math.round((totalRevenue / totalOrders) * 100) / 100 : 0,
      stores: perStore.map((s) => ({
        storeId: s.storeId,
        storeName: s.storeName,
        ordersToday: s.ordersToday,
        revenueToday: s.revenueToday,
        avgOrderValue: s.avgOrderValue,
      })),
      recentOrders: perStore
        // Per-store order ids restart at ORD-1000, so namespace by store for the
        // company-wide list to keep ids globally unique (no React key clashes).
        .flatMap((s) =>
          s.orders.map((o) => ({
            ...o,
            id: `${o.id}-${s.storeId.slice(0, 4)}`,
            storeName: s.storeName,
          })),
        )
        .sort((a, b) => +new Date(b.placedAt) - +new Date(a.placedAt))
        .slice(0, 20),
    };
  }

  /**
   * Mock recent sales/orders for a store — deterministic (seeded by store id).
   * Placeholder until the checkout module persists real orders. The product mix
   * is drawn from the store's real products when available.
   */
  async sales(companyId: string, storeId: string) {
    await this.stores.get(companyId, storeId);
    const list = await this.listProducts(companyId, storeId);
    const currency = list[0]?.currency ?? 'USD';

    let s = [...storeId].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 11) || 1;
    const rng = () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };

    const channels = ['In-store', 'Online', 'Phone'];
    const orders = Array.from({ length: 12 }, (_, i) => {
      const items = 1 + Math.floor(rng() * 4);
      const total = Math.round((8 + rng() * 180) * 100) / 100;
      const productName = list.length
        ? list[Math.floor(rng() * list.length)].name
        : ['Espresso', 'T-Shirt', 'Combo Meal', 'Service'][Math.floor(rng() * 4)];
      const minsAgo = Math.floor(rng() * 60 * 36);
      return {
        id: `ORD-${(1000 + i).toString()}`,
        items,
        total,
        currency,
        channel: channels[Math.floor(rng() * channels.length)],
        sampleProduct: productName,
        placedAt: new Date(Date.now() - minsAgo * 60_000).toISOString(),
      };
    });

    const todayRevenue = Math.round(orders.reduce((a, o) => a + o.total, 0) * 100) / 100;
    return {
      storeId,
      currency,
      ordersToday: orders.length + Math.floor(rng() * 30),
      revenueToday: todayRevenue,
      avgOrderValue: Math.round((todayRevenue / Math.max(orders.length, 1)) * 100) / 100,
      orders,
    };
  }
}
