import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { DatabaseService } from '../database/database.service';
import {
  posCustomers,
  posDiscounts,
  posOrderItems,
  posOrders,
  posPayments,
  posRegisterSessions,
  posStockMovements,
  products,
} from '../database/schema';
import { StoresService } from './stores.service';
import type { CheckoutDto, RefundOrderDto } from './dto/pos.dto';

/**
 * The checkout engine. `checkout` validates stock, prices the cart (line
 * discounts + order discount + store tax), persists order + items + payment,
 * decrements stock, logs stock movements, accrues loyalty, and bumps the open
 * register session's expected cash — all inside ONE withTenant() transaction so
 * a failure rolls the whole sale back. `refund` reverses it.
 */
@Injectable()
export class PosOrdersService {
  constructor(
    private readonly db: DatabaseService,
    private readonly stores: StoresService,
    private readonly tenant: TenantContextService,
  ) {}

  private cashierId(): string | undefined {
    return this.tenant.get()?.user.userId;
  }

  async checkout(companyId: string, storeId: string, dto: CheckoutDto) {
    const store = await this.stores.get(companyId, storeId);
    const taxRate = readTaxRate(store.settings);

    return this.db.withTenant(companyId, async (tx) => {
      // 1. Load + lock the products; validate stock.
      const ids = dto.items.map((i) => i.productId);
      const rows = await tx.query.products.findMany({
        where: and(eq(products.storeId, storeId), sql`${products.id} = ANY(${ids})`),
      });
      const byId = new Map(rows.map((p) => [p.id, p]));

      let subtotal = 0;
      let taxable = 0;
      const lineRows: {
        productId: string;
        name: string;
        sku: string | null;
        unitPrice: number;
        quantity: number;
        lineDiscount: number;
        lineTotal: number;
      }[] = [];

      for (const item of dto.items) {
        const p = byId.get(item.productId);
        if (!p) throw new NotFoundException(`Product ${item.productId} not found in this store.`);
        if (p.stock < item.quantity) {
          throw new BadRequestException(`Not enough stock for "${p.name}" (${p.stock} left).`);
        }
        const unit = Number(p.price);
        const gross = unit * item.quantity;
        const lineDiscount = Math.min(item.lineDiscount ?? 0, gross);
        const lineTotal = round2(gross - lineDiscount);
        subtotal = round2(subtotal + lineTotal);
        if (p.taxable !== 'false') taxable = round2(taxable + lineTotal);
        lineRows.push({
          productId: p.id,
          name: p.name,
          sku: p.sku,
          unitPrice: unit,
          quantity: item.quantity,
          lineDiscount,
          lineTotal,
        });
      }

      // 2. Order-level discount (explicit amount or a discount rule).
      let orderDiscount = dto.orderDiscount ?? 0;
      if (dto.discountId) {
        const rule = await tx.query.posDiscounts.findFirst({
          where: eq(posDiscounts.id, dto.discountId),
        });
        if (rule && rule.active !== 'false') {
          orderDiscount =
            rule.kind === 'percent'
              ? round2((subtotal * Number(rule.value)) / 100)
              : Number(rule.value);
        }
      }
      orderDiscount = Math.min(orderDiscount, subtotal);
      const discountedTaxable = subtotal > 0 ? taxable * (1 - orderDiscount / subtotal) : 0;
      const taxTotal = round2((discountedTaxable * taxRate) / 100);
      const total = round2(subtotal - orderDiscount + taxTotal);
      const currency = rows[0]?.currency ?? 'USD';

      // 3. Payment / change.
      const tendered = dto.paymentMethod === 'cash' ? dto.tendered ?? total : undefined;
      if (dto.paymentMethod === 'cash' && tendered != null && tendered < total) {
        throw new BadRequestException('Cash tendered is less than the total.');
      }
      const change = tendered != null ? round2(tendered - total) : undefined;

      // 4. Loyalty (1 pt per whole currency unit spent).
      const loyaltyEarned = dto.customerId ? Math.floor(total) : 0;

      // 5. Order number (per store).
      const orderNumber = await this.nextOrderNumber(tx, storeId);

      const [order] = await tx
        .insert(posOrders)
        .values({
          companyId,
          storeId,
          orderNumber,
          registerId: dto.registerId,
          sessionId: dto.sessionId,
          cashierId: this.cashierId(),
          customerId: dto.customerId,
          discountId: dto.discountId,
          subtotal: String(subtotal),
          discountTotal: String(orderDiscount),
          taxTotal: String(taxTotal),
          total: String(total),
          currency,
          paymentMethod: dto.paymentMethod,
          status: 'completed',
          loyaltyEarned,
          note: dto.note,
        })
        .returning();

      // 6. Line items.
      await tx.insert(posOrderItems).values(
        lineRows.map((l) => ({
          companyId,
          orderId: order.id,
          productId: l.productId,
          name: l.name,
          sku: l.sku,
          unitPrice: String(l.unitPrice),
          quantity: l.quantity,
          discountTotal: String(l.lineDiscount),
          lineTotal: String(l.lineTotal),
        })),
      );

      // 7. Payment.
      await tx.insert(posPayments).values({
        companyId,
        orderId: order.id,
        method: dto.paymentMethod,
        amount: String(total),
        tendered: tendered != null ? String(tendered) : undefined,
        change: change != null ? String(change) : undefined,
      });

      // 8. Decrement stock + movement log.
      for (const l of lineRows) {
        const p = byId.get(l.productId)!;
        const next = p.stock - l.quantity;
        await tx.update(products).set({ stock: next }).where(eq(products.id, l.productId));
        await tx.insert(posStockMovements).values({
          companyId,
          storeId,
          productId: l.productId,
          delta: -l.quantity,
          balance: next,
          reason: 'sale',
          orderId: order.id,
          actorId: this.cashierId(),
        });
      }

      // 9. Loyalty + spend on the customer.
      if (dto.customerId) {
        await tx
          .update(posCustomers)
          .set({
            loyaltyPoints: sql`${posCustomers.loyaltyPoints} + ${loyaltyEarned}`,
            totalSpent: sql`${posCustomers.totalSpent} + ${total}`,
            orderCount: sql`${posCustomers.orderCount} + 1`,
          })
          .where(eq(posCustomers.id, dto.customerId));
      }

      // 10. Register session expected cash (cash sales only).
      if (dto.sessionId && dto.paymentMethod === 'cash') {
        await tx
          .update(posRegisterSessions)
          .set({ expectedCash: sql`${posRegisterSessions.expectedCash} + ${total}` })
          .where(eq(posRegisterSessions.id, dto.sessionId));
      }

      return { ...order, change, tendered, items: lineRows };
    });
  }

  /** Refund/void a completed order — reverses stock + loyalty. */
  async refund(companyId: string, storeId: string, orderId: string, dto: RefundOrderDto) {
    await this.stores.get(companyId, storeId);
    return this.db.withTenant(companyId, async (tx) => {
      const order = await tx.query.posOrders.findFirst({
        where: and(eq(posOrders.id, orderId), eq(posOrders.storeId, storeId)),
        with: { items: true },
      });
      if (!order) throw new NotFoundException('Order not found.');
      if (order.status !== 'completed') {
        throw new BadRequestException('Only completed orders can be refunded.');
      }

      const restock = dto.restock !== false;
      if (restock) {
        for (const it of order.items) {
          if (!it.productId) continue;
          const p = await tx.query.products.findFirst({ where: eq(products.id, it.productId) });
          if (!p) continue;
          const next = p.stock + it.quantity;
          await tx.update(products).set({ stock: next }).where(eq(products.id, it.productId));
          await tx.insert(posStockMovements).values({
            companyId,
            storeId,
            productId: it.productId,
            delta: it.quantity,
            balance: next,
            reason: 'refund',
            orderId: order.id,
            actorId: this.cashierId(),
          });
        }
      }

      if (order.customerId) {
        await tx
          .update(posCustomers)
          .set({
            loyaltyPoints: sql`greatest(0, ${posCustomers.loyaltyPoints} - ${order.loyaltyEarned})`,
            totalSpent: sql`greatest(0, ${posCustomers.totalSpent} - ${order.total})`,
            orderCount: sql`greatest(0, ${posCustomers.orderCount} - 1)`,
          })
          .where(eq(posCustomers.id, order.customerId));
      }

      if (order.sessionId && order.paymentMethod === 'cash') {
        await tx
          .update(posRegisterSessions)
          .set({ expectedCash: sql`${posRegisterSessions.expectedCash} - ${order.total}` })
          .where(eq(posRegisterSessions.id, order.sessionId));
      }

      const [row] = await tx
        .update(posOrders)
        .set({
          status: 'refunded',
          refundedAt: new Date(),
          refundedBy: this.cashierId(),
          refundReason: dto.reason,
        })
        .where(eq(posOrders.id, orderId))
        .returning();
      return row;
    });
  }

  // ── reads ───────────────────────────────────────────────────────────────────
  /** Company-wide order list (optionally filtered by store), newest first. */
  async listOrders(companyId: string, storeId?: string, limit = 100) {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.posOrders.findMany({
        where: storeId ? eq(posOrders.storeId, storeId) : undefined,
        orderBy: (o, { desc }) => desc(o.createdAt),
        limit,
        with: {
          store: { columns: { name: true } },
          customer: { columns: { name: true } },
        },
      }),
    );
  }

  async getOrder(companyId: string, orderId: string) {
    const order = await this.db.withTenant(companyId, (tx) =>
      tx.query.posOrders.findFirst({
        where: eq(posOrders.id, orderId),
        with: {
          items: true,
          payments: true,
          store: { columns: { name: true, code: true } },
          customer: { columns: { name: true, email: true, phone: true } },
        },
      }),
    );
    if (!order) throw new NotFoundException('Order not found.');
    return order;
  }

  private async nextOrderNumber(
    tx: Parameters<Parameters<DatabaseService['withTenant']>[1]>[0],
    storeId: string,
  ): Promise<string> {
    const [last] = await tx
      .select({ n: posOrders.orderNumber })
      .from(posOrders)
      .where(eq(posOrders.storeId, storeId))
      .orderBy(desc(posOrders.createdAt))
      .limit(1);
    const lastNum = last?.n ? parseInt(last.n.replace(/\D/g, ''), 10) || 1000 : 1000;
    return `ORD-${String(lastNum + 1).padStart(6, '0')}`;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Store tax rate percent from stores.settings.taxRate (default 0). */
function readTaxRate(settings: unknown): number {
  if (settings && typeof settings === 'object' && 'taxRate' in settings) {
    const v = Number((settings as { taxRate: unknown }).taxRate);
    return Number.isFinite(v) && v >= 0 ? v : 0;
  }
  return 0;
}
