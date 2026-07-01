import { Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import {
  posOrderItems,
  posOrders,
  posStockMovements,
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
import type { RestockDto } from './dto/pos.dto';

/**
 * POS product + inventory management, plus REAL sales reporting from persisted
 * orders (pos_orders). Tenant-scoped via RLS + StoresService scope checks.
 * Checkout / registers / customers live in their own services.
 */
@Injectable()
export class PosService {
  constructor(
    private readonly db: DatabaseService,
    private readonly stores: StoresService,
    private readonly tenant: TenantContextService,
  ) {}

  private actorId(): string | undefined {
    return this.tenant.get()?.user.userId;
  }

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
          barcode: dto.barcode,
          categoryId: dto.categoryId,
          price: dto.price != null ? String(dto.price) : '0',
          cost: dto.cost != null ? String(dto.cost) : undefined,
          currency: dto.currency ?? 'USD',
          taxable: dto.taxable === false ? 'false' : 'true',
          stock: dto.stock ?? 0,
          lowStockThreshold: dto.lowStockThreshold ?? 5,
          imageUrl: dto.imageUrl,
          status: dto.status ?? 'active',
        })
        .returning();
      // Seed the inventory ledger with the opening balance.
      if ((dto.stock ?? 0) > 0) {
        await tx.insert(posStockMovements).values({
          companyId,
          storeId,
          productId: row.id,
          delta: row.stock,
          balance: row.stock,
          reason: 'initial',
          actorId: this.actorId(),
        });
      }
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
      const { price, cost, taxable, stock: _ignoreStock, ...rest } = dto;
      const [row] = await tx
        .update(products)
        .set({
          ...rest,
          // Stock is only changed via adjust/restock so the ledger stays truthful.
          price: price != null ? String(price) : undefined,
          cost: cost != null ? String(cost) : undefined,
          taxable: taxable === undefined ? undefined : taxable ? 'true' : 'false',
        })
        .where(and(eq(products.id, id), eq(products.storeId, storeId)))
        .returning();
      if (!row) throw new NotFoundException('Product not found.');
      return row;
    });
  }

  /** Legacy inline stock ± (kept for the product card). Logs a movement. */
  async adjustStock(
    companyId: string,
    storeId: string,
    id: string,
    dto: AdjustStockDto,
  ): Promise<Product> {
    return this.restock(companyId, storeId, id, { delta: dto.delta, reason: 'adjust' });
  }

  /** Receive/adjust stock with an audit movement. */
  async restock(
    companyId: string,
    storeId: string,
    id: string,
    dto: RestockDto,
  ): Promise<Product> {
    await this.stores.get(companyId, storeId);
    return this.db.withTenant(companyId, async (tx) => {
      const product = await tx.query.products.findFirst({
        where: and(eq(products.id, id), eq(products.storeId, storeId)),
      });
      if (!product) throw new NotFoundException('Product not found.');
      const next = Math.max(0, product.stock + dto.delta);
      const applied = next - product.stock;
      const [row] = await tx
        .update(products)
        .set({ stock: next })
        .where(eq(products.id, id))
        .returning();
      if (applied !== 0) {
        await tx.insert(posStockMovements).values({
          companyId,
          storeId,
          productId: id,
          delta: applied,
          balance: next,
          reason: dto.reason ?? 'restock',
          note: dto.note,
          actorId: this.actorId(),
        });
      }
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

  // ── inventory (stock movements) ─────────────────────────────────────────────
  async stockMovements(companyId: string, storeId: string, productId?: string) {
    await this.stores.get(companyId, storeId);
    return this.db.withTenant(companyId, (tx) =>
      tx.query.posStockMovements.findMany({
        where: productId
          ? and(eq(posStockMovements.storeId, storeId), eq(posStockMovements.productId, productId))
          : eq(posStockMovements.storeId, storeId),
        orderBy: (m, { desc }) => desc(m.createdAt),
        limit: 200,
        with: { product: { columns: { name: true, sku: true } } },
      }),
    );
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

  // ── REAL sales reporting (from pos_orders) ──────────────────────────────────
  private windowStart(range: 'today' | '7d' | '30d'): Date {
    const now = new Date();
    if (range === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const days = range === '7d' ? 7 : 30;
    return new Date(now.getTime() - days * 86_400_000);
  }

  /** Per-store sales summary for a window (default today). */
  async sales(companyId: string, storeId: string, range: 'today' | '7d' | '30d' = 'today') {
    await this.stores.get(companyId, storeId);
    const from = this.windowStart(range);
    return this.db.withTenant(companyId, async (tx) => {
      const rows = await tx.query.posOrders.findMany({
        where: and(
          eq(posOrders.storeId, storeId),
          eq(posOrders.status, 'completed'),
          gte(posOrders.createdAt, from),
        ),
        orderBy: (o, { desc }) => desc(o.createdAt),
        with: { customer: { columns: { name: true } } },
        limit: 100,
      });
      const currency = rows[0]?.currency ?? 'USD';
      const revenue = round2(rows.reduce((a, o) => a + Number(o.total), 0));
      const orders = rows.length;
      return {
        storeId,
        currency,
        ordersToday: orders,
        revenueToday: revenue,
        avgOrderValue: orders > 0 ? round2(revenue / orders) : 0,
        orders: rows.map((o) => ({
          id: o.orderNumber,
          items: 0,
          total: Number(o.total),
          currency: o.currency,
          channel: o.paymentMethod,
          sampleProduct: o.customer?.name ?? 'Walk-in',
          placedAt: o.createdAt.toISOString(),
        })),
      };
    });
  }

  /** Aggregated real sales across all the company's stores (today). */
  async companySales(companyId: string) {
    return this.db.withTenant(companyId, async (tx) => {
      const from = this.windowStart('today');
      const storeRows = await tx.query.stores.findMany({ columns: { id: true, name: true } });
      const orders = await tx.query.posOrders.findMany({
        where: and(eq(posOrders.status, 'completed'), gte(posOrders.createdAt, from)),
        orderBy: (o, { desc }) => desc(o.createdAt),
        with: { customer: { columns: { name: true } } },
        limit: 300,
      });
      const nameById = new Map(storeRows.map((s) => [s.id, s.name]));
      const byStore = new Map<string, { orders: number; revenue: number }>();
      for (const o of orders) {
        const agg = byStore.get(o.storeId) ?? { orders: 0, revenue: 0 };
        agg.orders += 1;
        agg.revenue += Number(o.total);
        byStore.set(o.storeId, agg);
      }
      const totalRevenue = round2(orders.reduce((a, o) => a + Number(o.total), 0));
      const totalOrders = orders.length;
      const currency = orders[0]?.currency ?? 'USD';
      return {
        currency,
        totalRevenue,
        totalOrders,
        avgOrderValue: totalOrders > 0 ? round2(totalRevenue / totalOrders) : 0,
        stores: storeRows.map((s) => {
          const agg = byStore.get(s.id) ?? { orders: 0, revenue: 0 };
          return {
            storeId: s.id,
            storeName: s.name,
            ordersToday: agg.orders,
            revenueToday: round2(agg.revenue),
            avgOrderValue: agg.orders > 0 ? round2(agg.revenue / agg.orders) : 0,
          };
        }),
        recentOrders: orders.slice(0, 20).map((o) => ({
          id: o.id,
          items: 0,
          total: Number(o.total),
          currency: o.currency,
          channel: o.paymentMethod,
          sampleProduct: o.customer?.name ?? 'Walk-in',
          placedAt: o.createdAt.toISOString(),
          storeName: nameById.get(o.storeId) ?? '—',
        })),
      };
    });
  }

  /**
   * Rich company sales report for the POS Reports page: KPIs, a daily revenue
   * series, top products, and per-payment split — all from real orders.
   */
  async report(companyId: string, range: '7d' | '30d' = '7d', storeId?: string) {
    return this.db.withTenant(companyId, async (tx) => {
      const from = this.windowStart(range);
      const conds = [eq(posOrders.status, 'completed'), gte(posOrders.createdAt, from)];
      if (storeId) conds.push(eq(posOrders.storeId, storeId));

      const orders = await tx
        .select()
        .from(posOrders)
        .where(and(...conds))
        .orderBy(desc(posOrders.createdAt));
      const currency = orders[0]?.currency ?? 'USD';
      const revenue = round2(orders.reduce((a, o) => a + Number(o.total), 0));
      const tax = round2(orders.reduce((a, o) => a + Number(o.taxTotal), 0));
      const discounts = round2(orders.reduce((a, o) => a + Number(o.discountTotal), 0));

      // Daily revenue series.
      const days = range === '7d' ? 7 : 30;
      const series: { date: string; revenue: number; orders: number }[] = [];
      for (let i = days - 1; i >= 0; i--) {
        const key = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
        series.push({ date: key, revenue: 0, orders: 0 });
      }
      const idx = new Map(series.map((s, i) => [s.date, i]));
      for (const o of orders) {
        const i = idx.get(o.createdAt.toISOString().slice(0, 10));
        if (i != null) {
          series[i].revenue = round2(series[i].revenue + Number(o.total));
          series[i].orders += 1;
        }
      }

      // Payment split.
      const payment = new Map<string, number>();
      for (const o of orders) payment.set(o.paymentMethod, (payment.get(o.paymentMethod) ?? 0) + 1);

      // Top products (from order items joined with these orders).
      const orderIds = orders.map((o) => o.id);
      let topProducts: { name: string; quantity: number; revenue: number }[] = [];
      if (orderIds.length) {
        const items = await tx
          .select({
            name: posOrderItems.name,
            quantity: sql<number>`sum(${posOrderItems.quantity})::int`,
            revenue: sql<string>`sum(${posOrderItems.lineTotal})`,
          })
          .from(posOrderItems)
          .where(inArray(posOrderItems.orderId, orderIds))
          .groupBy(posOrderItems.name)
          .orderBy(desc(sql`sum(${posOrderItems.lineTotal})`))
          .limit(8);
        topProducts = items.map((i) => ({
          name: i.name,
          quantity: Number(i.quantity),
          revenue: round2(Number(i.revenue)),
        }));
      }

      return {
        range,
        currency,
        totals: {
          revenue,
          orders: orders.length,
          avgOrderValue: orders.length ? round2(revenue / orders.length) : 0,
          tax,
          discounts,
        },
        series,
        paymentSplit: [...payment.entries()].map(([method, count]) => ({ method, count })),
        topProducts,
      };
    });
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
