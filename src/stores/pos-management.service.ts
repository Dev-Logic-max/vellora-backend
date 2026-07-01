import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { DatabaseService } from '../database/database.service';
import {
  posCustomers,
  posDiscounts,
  posOrders,
  posRegisterSessions,
  posRegisters,
  stores,
} from '../database/schema';
import { StoresService } from './stores.service';
import type {
  AdjustLoyaltyDto,
  CloseSessionDto,
  CreateCustomerDto,
  CreateDiscountDto,
  CreateRegisterDto,
  OpenSessionDto,
  SetTaxDto,
  UpdateCustomerDto,
  UpdateDiscountDto,
} from './dto/pos.dto';

/**
 * POS back-office: customers + loyalty, discounts/coupons, registers + cash
 * sessions, and store tax config. All tenant-scoped (RLS + StoresService scope).
 */
@Injectable()
export class PosManagementService {
  constructor(
    private readonly db: DatabaseService,
    private readonly stores: StoresService,
    private readonly tenant: TenantContextService,
  ) {}

  private userId(): string | undefined {
    return this.tenant.get()?.user.userId;
  }

  // ── customers ───────────────────────────────────────────────────────────────
  async listCustomers(companyId: string) {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.posCustomers.findMany({
        orderBy: (c, { desc }) => desc(c.totalSpent),
        limit: 500,
      }),
    );
  }

  async createCustomer(companyId: string, dto: CreateCustomerDto) {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx
        .insert(posCustomers)
        .values({
          companyId,
          name: dto.name,
          email: dto.email || null,
          phone: dto.phone,
          storeId: dto.storeId,
          notes: dto.notes,
        })
        .returning();
      return row;
    });
  }

  async updateCustomer(companyId: string, id: string, dto: UpdateCustomerDto) {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx
        .update(posCustomers)
        .set({ ...dto, email: dto.email === '' ? null : dto.email })
        .where(eq(posCustomers.id, id))
        .returning();
      if (!row) throw new NotFoundException('Customer not found.');
      return row;
    });
  }

  async deleteCustomer(companyId: string, id: string) {
    await this.db.withTenant(companyId, (tx) =>
      tx.delete(posCustomers).where(eq(posCustomers.id, id)),
    );
    return { id };
  }

  async adjustLoyalty(companyId: string, id: string, dto: AdjustLoyaltyDto) {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx
        .update(posCustomers)
        .set({ loyaltyPoints: sql`greatest(0, ${posCustomers.loyaltyPoints} + ${dto.delta})` })
        .where(eq(posCustomers.id, id))
        .returning();
      if (!row) throw new NotFoundException('Customer not found.');
      return row;
    });
  }

  /** A customer's purchase history (orders). */
  async customerOrders(companyId: string, id: string) {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.posOrders.findMany({
        where: eq(posOrders.customerId, id),
        orderBy: (o, { desc }) => desc(o.createdAt),
        limit: 100,
        with: { store: { columns: { name: true } } },
      }),
    );
  }

  // ── discounts ─────────────────────────────────────────────────────────────
  async listDiscounts(companyId: string) {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.posDiscounts.findMany({ orderBy: (d, { desc }) => desc(d.createdAt) }),
    );
  }

  async createDiscount(companyId: string, dto: CreateDiscountDto) {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx
        .insert(posDiscounts)
        .values({
          companyId,
          name: dto.name,
          code: dto.code,
          kind: dto.kind,
          value: String(dto.value),
          storeId: dto.storeId,
          active: dto.active === false ? 'false' : 'true',
        })
        .returning();
      return row;
    });
  }

  async updateDiscount(companyId: string, id: string, dto: UpdateDiscountDto) {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx
        .update(posDiscounts)
        .set({
          ...dto,
          value: dto.value != null ? String(dto.value) : undefined,
          active: dto.active === undefined ? undefined : dto.active ? 'true' : 'false',
        })
        .where(eq(posDiscounts.id, id))
        .returning();
      if (!row) throw new NotFoundException('Discount not found.');
      return row;
    });
  }

  async deleteDiscount(companyId: string, id: string) {
    await this.db.withTenant(companyId, (tx) =>
      tx.delete(posDiscounts).where(eq(posDiscounts.id, id)),
    );
    return { id };
  }

  // ── registers + sessions ────────────────────────────────────────────────────
  async listRegisters(companyId: string, storeId: string) {
    await this.stores.get(companyId, storeId);
    return this.db.withTenant(companyId, (tx) =>
      tx.query.posRegisters.findMany({
        where: eq(posRegisters.storeId, storeId),
        orderBy: (r, { asc }) => asc(r.name),
        with: {
          sessions: {
            where: eq(posRegisterSessions.status, 'open'),
            limit: 1,
          },
        },
      }),
    );
  }

  async createRegister(companyId: string, storeId: string, dto: CreateRegisterDto) {
    await this.stores.get(companyId, storeId);
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx
        .insert(posRegisters)
        .values({ companyId, storeId, name: dto.name })
        .returning();
      return row;
    });
  }

  async deleteRegister(companyId: string, storeId: string, id: string) {
    await this.stores.get(companyId, storeId);
    await this.db.withTenant(companyId, (tx) =>
      tx.delete(posRegisters).where(and(eq(posRegisters.id, id), eq(posRegisters.storeId, storeId))),
    );
    return { id };
  }

  async openSession(companyId: string, storeId: string, dto: OpenSessionDto) {
    await this.stores.get(companyId, storeId);
    return this.db.withTenant(companyId, async (tx) => {
      const existing = await tx.query.posRegisterSessions.findFirst({
        where: and(
          eq(posRegisterSessions.registerId, dto.registerId),
          eq(posRegisterSessions.status, 'open'),
        ),
      });
      if (existing) throw new BadRequestException('This register already has an open session.');
      const [row] = await tx
        .insert(posRegisterSessions)
        .values({
          companyId,
          storeId,
          registerId: dto.registerId,
          openedBy: this.userId(),
          openingCash: String(dto.openingCash ?? 0),
          note: dto.note,
        })
        .returning();
      return row;
    });
  }

  async closeSession(companyId: string, storeId: string, id: string, dto: CloseSessionDto) {
    await this.stores.get(companyId, storeId);
    return this.db.withTenant(companyId, async (tx) => {
      const session = await tx.query.posRegisterSessions.findFirst({
        where: and(eq(posRegisterSessions.id, id), eq(posRegisterSessions.storeId, storeId)),
      });
      if (!session) throw new NotFoundException('Session not found.');
      if (session.status !== 'open') throw new BadRequestException('Session is already closed.');
      const [row] = await tx
        .update(posRegisterSessions)
        .set({
          status: 'closed',
          closedBy: this.userId(),
          closedAt: new Date(),
          countedCash: String(dto.countedCash),
          note: dto.note ?? session.note,
        })
        .where(eq(posRegisterSessions.id, id))
        .returning();
      const expected = Number(session.openingCash) + Number(session.expectedCash);
      return { ...row, expectedTotal: round2(expected), over: round2(dto.countedCash - expected) };
    });
  }

  async sessionHistory(companyId: string, storeId: string) {
    await this.stores.get(companyId, storeId);
    return this.db.withTenant(companyId, (tx) =>
      tx
        .select()
        .from(posRegisterSessions)
        .where(eq(posRegisterSessions.storeId, storeId))
        .orderBy(desc(posRegisterSessions.openedAt))
        .limit(50),
    );
  }

  // ── store tax config ─────────────────────────────────────────────────────────
  async setTax(companyId: string, storeId: string, dto: SetTaxDto) {
    const store = await this.stores.get(companyId, storeId);
    const settings = { ...(store.settings as Record<string, unknown>), taxRate: dto.taxRate };
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx
        .update(stores)
        .set({ settings })
        .where(eq(stores.id, storeId))
        .returning();
      return { taxRate: dto.taxRate, storeId: row.id };
    });
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
