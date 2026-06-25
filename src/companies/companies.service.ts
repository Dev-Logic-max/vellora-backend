import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, count, eq, inArray, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import {
  companies,
  discounts,
  employees,
  entitlementOverrides,
  memberships,
  plans,
  stores,
  subscriptions,
  users,
  type Company,
  type MembershipRole,
} from '../database/schema';
import { defaultsForCountry } from './country-defaults';
import type { CreateCompanyDto, CustomPricing } from './dto/create-company.dto';
import type { UpdateCompanyDto } from './dto/update-company.dto';

export interface CompanyWithRole extends Company {
  role: MembershipRole;
  /** Directory summary for the companies table (privileged aggregates). */
  storeCount: number;
  employeeCount: number;
  ownerName: string | null;
  ownerAvatarUrl: string | null;
  planName: string | null;
  /** A small sample of employee avatars for the overlapping stack (up to 4). */
  employeeAvatars: { name: string; avatarUrl: string | null }[];
}

/**
 * Company lifecycle. Provisioning + cross-tenant listing run on the privileged
 * connection; reads/updates of a specific company go through `withTenant`, so
 * RLS guarantees a tenant can only touch its own row.
 */
@Injectable()
export class CompaniesService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly auditService: AuditService,
  ) {}

  async createWithOwner(dto: CreateCompanyDto, ownerUserId: string): Promise<Company> {
    const ownerId = dto.ownerUserId ?? ownerUserId;
    // Resolve the chosen plan key → plan row (custom pricing is handled below,
    // not via a "custom" plan row). Privileged read of the global plans table.
    const planId =
      dto.planKey && dto.planKey !== 'custom'
        ? ((
            await this.databaseService.db.query.plans.findFirst({
              where: eq(plans.key, dto.planKey),
              columns: { id: true },
            })
          )?.id ?? null)
        : null;

    // Country-first (point 17): fall back to the country's currency/timezone when
    // the client doesn't send explicit values.
    const countryDefaults = defaultsForCountry(dto.country);

    const company = await this.databaseService.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(companies)
        .values({
          name: dto.name,
          ...(dto.country ? { country: dto.country } : {}),
          currency: dto.currency ?? countryDefaults.currency,
          timezone: dto.timezone ?? countryDefaults.timezone,
          groupId: dto.groupId ?? null,
          ownerUserId: ownerId,
          ...(dto.category ? { category: dto.category } : {}),
          ...(dto.registrationNumber ? { registrationNumber: dto.registrationNumber } : {}),
          ...(dto.companyEmail ? { companyEmail: dto.companyEmail } : {}),
          ...(dto.phone ? { phone: dto.phone } : {}),
          ...(dto.state ? { state: dto.state } : {}),
          ...(dto.city ? { city: dto.city } : {}),
          ...(dto.postalCode ? { postalCode: dto.postalCode } : {}),
          ...(dto.headOfficeAddress ? { headOfficeAddress: dto.headOfficeAddress } : {}),
          ...(dto.offices ? { offices: dto.offices } : {}),
          ...(planId ? { planId } : {}),
        })
        .returning();

      // The owner gets an owner membership (the chairman). If a different owner
      // was chosen, the creator stays the acting member via this membership too.
      await tx.insert(memberships).values({
        userId: ownerId,
        companyId: created.id,
        role: 'owner',
        scopeType: 'company',
        scopeIds: [],
        status: 'active',
      });

      return created;
    });

    if (dto.planKey === 'custom' && dto.customPricing) {
      await this.applyCustomPricing(company.id, dto.customPricing, ownerId);
    }
    return company;
  }

  /**
   * Persists negotiated custom pricing into the platform billing model: the
   * per-unit prices + storage window land in the company's entitlement override
   * (`limits.customPricing`), and the discount window into `discounts`. No new
   * table — reuses the existing override/discount structures (decision: store on
   * entitlement override).
   */
  private async applyCustomPricing(
    companyId: string,
    pricing: CustomPricing,
    updatedBy: string,
  ): Promise<void> {
    const db = this.databaseService.db;
    const limits: Record<string, unknown> = {
      customPricing: {
        pricePerEmployee: pricing.pricePerEmployee ?? null,
        pricePerDevice: pricing.pricePerDevice ?? null,
        extraStoragePricePerGb: pricing.extraStoragePricePerGb ?? null,
        storageFrom: pricing.storageFrom ?? null,
        storageTo: pricing.storageTo ?? null,
      },
    };
    if (pricing.storageLimitGb !== undefined) limits.storage_gb = pricing.storageLimitGb;

    await db
      .insert(entitlementOverrides)
      .values({ companyId, entitlements: {}, limits, updatedBy })
      .onConflictDoUpdate({
        target: entitlementOverrides.companyId,
        set: { limits, updatedBy, updatedAt: new Date() },
      });

    if (pricing.discountPct !== undefined && pricing.discountPct > 0) {
      await db.insert(discounts).values({
        companyId,
        pct: pricing.discountPct,
        validFrom: pricing.discountFrom ? new Date(pricing.discountFrom) : null,
        validTo: pricing.discountTo ? new Date(pricing.discountTo) : null,
      });
    }
  }

  /** Companies the user is an active member of (cross-tenant; privileged), each
   * enriched with directory aggregates (stores, employees, owner, plan). */
  async listForUser(userId: string): Promise<CompanyWithRole[]> {
    const db = this.databaseService.db;
    const rows = await db
      .select({ company: companies, role: memberships.role })
      .from(memberships)
      .innerJoin(companies, eq(companies.id, memberships.companyId))
      .where(and(eq(memberships.userId, userId), eq(memberships.status, 'active')));

    const ids = rows.map((r) => r.company.id);
    if (ids.length === 0) return [];

    // Batched aggregates keyed by company id (one query each).
    const [storeRows, empRows, ownerRows, planRows, empSampleRows] = await Promise.all([
      db
        .select({ companyId: stores.companyId, value: count() })
        .from(stores)
        .where(inArray(stores.companyId, ids))
        .groupBy(stores.companyId),
      db
        .select({ companyId: employees.companyId, value: count() })
        .from(employees)
        .where(inArray(employees.companyId, ids))
        .groupBy(employees.companyId),
      db
        .select({
          companyId: memberships.companyId,
          name: sql<string | null>`max(${users.name})`,
          avatarUrl: sql<string | null>`max(${users.avatarUrl})`,
        })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(and(inArray(memberships.companyId, ids), eq(memberships.role, 'owner')))
        .groupBy(memberships.companyId),
      db
        .select({ companyId: subscriptions.companyId, name: plans.name })
        .from(subscriptions)
        .innerJoin(plans, eq(plans.id, subscriptions.planId))
        .where(inArray(subscriptions.companyId, ids)),
      // A flat sample of employees per company (we cap to 4 each in JS below).
      db
        .select({
          companyId: employees.companyId,
          firstName: employees.firstName,
          lastName: employees.lastName,
          avatarUrl: employees.avatarUrl,
        })
        .from(employees)
        .where(inArray(employees.companyId, ids))
        .limit(2000),
    ]);

    const storeMap = new Map(storeRows.map((r) => [r.companyId, Number(r.value)]));
    const empMap = new Map(empRows.map((r) => [r.companyId, Number(r.value)]));
    const ownerMap = new Map(ownerRows.map((r) => [r.companyId, r]));
    const planMap = new Map(planRows.map((r) => [r.companyId, r.name]));

    const avatarMap = new Map<string, { name: string; avatarUrl: string | null }[]>();
    for (const r of empSampleRows) {
      const list = avatarMap.get(r.companyId) ?? [];
      if (list.length < 4) {
        list.push({ name: `${r.firstName} ${r.lastName}`.trim(), avatarUrl: r.avatarUrl });
        avatarMap.set(r.companyId, list);
      }
    }

    return rows.map((row) => ({
      ...row.company,
      role: row.role,
      storeCount: storeMap.get(row.company.id) ?? 0,
      employeeCount: empMap.get(row.company.id) ?? 0,
      ownerName: ownerMap.get(row.company.id)?.name ?? null,
      ownerAvatarUrl: ownerMap.get(row.company.id)?.avatarUrl ?? null,
      planName: planMap.get(row.company.id) ?? null,
      employeeAvatars: avatarMap.get(row.company.id) ?? [],
    }));
  }

  /** The caller's active tenant — RLS returns at most this one company. */
  async findCurrent(companyId: string): Promise<Company> {
    return this.databaseService.withTenant(companyId, async (tx) => {
      const company = await tx.query.companies.findFirst();
      if (!company) throw new NotFoundException('Company not found.');
      return company;
    });
  }

  async getById(companyId: string, userId: string, isPlatform = false): Promise<Company> {
    // Platform operators may read any company (cross-tenant, privileged); ordinary
    // users must be an active member (RLS-scoped read).
    if (isPlatform) {
      const company = await this.databaseService.db.query.companies.findFirst({
        where: eq(companies.id, companyId),
      });
      if (!company) throw new NotFoundException('Company not found.');
      return company;
    }
    await this.assertMember(companyId, userId);
    return this.findCurrentScoped(companyId);
  }

  async update(companyId: string, userId: string, dto: UpdateCompanyDto): Promise<Company> {
    await this.assertMember(companyId, userId);
    // Shallow-merge company settings so partial toggles don't drop other keys.
    let settingsPatch: Record<string, unknown> | undefined;
    if (dto.settings !== undefined) {
      const current = await this.databaseService.withTenant(companyId, (tx) =>
        tx.query.companies.findFirst({
          where: eq(companies.id, companyId),
          columns: { settings: true },
        }),
      );
      settingsPatch = { settings: { ...(current?.settings ?? {}), ...dto.settings } };
    }
    const patch = {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.category !== undefined ? { category: dto.category } : {}),
      ...(dto.country !== undefined ? { country: dto.country } : {}),
      ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
      ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
      ...(dto.registrationNumber !== undefined
        ? { registrationNumber: dto.registrationNumber }
        : {}),
      ...(dto.companyEmail !== undefined ? { companyEmail: dto.companyEmail || null } : {}),
      ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
      ...(dto.state !== undefined ? { state: dto.state } : {}),
      ...(dto.city !== undefined ? { city: dto.city } : {}),
      ...(dto.postalCode !== undefined ? { postalCode: dto.postalCode } : {}),
      ...(dto.headOfficeAddress !== undefined ? { headOfficeAddress: dto.headOfficeAddress } : {}),
      ...(dto.offices !== undefined ? { offices: dto.offices } : {}),
      ...(dto.logoUrl !== undefined ? { logoUrl: dto.logoUrl } : {}),
      ...(dto.bannerUrl !== undefined ? { bannerUrl: dto.bannerUrl } : {}),
      ...(settingsPatch ?? {}),
    };
    const updated = await this.databaseService.withTenant(companyId, async (tx) => {
      const [row] = await tx
        .update(companies)
        .set(patch)
        .where(eq(companies.id, companyId))
        .returning();
      return row;
    });
    if (!updated) throw new NotFoundException('Company not found.');
    return updated;
  }

  async deactivate(companyId: string, userId: string): Promise<Company> {
    await this.assertMember(companyId, userId);
    const updated = await this.databaseService.withTenant(companyId, async (tx) => {
      const [row] = await tx
        .update(companies)
        .set({ status: 'inactive' })
        .where(eq(companies.id, companyId))
        .returning();
      return row;
    });
    if (!updated) throw new NotFoundException('Company not found.');
    await this.auditService.log({
      companyId,
      actorUserId: userId,
      action: 'company.deactivate',
      resource: 'company',
      targetId: companyId,
    });
    return updated;
  }

  async usage(companyId: string, userId: string, isPlatform = false) {
    // Platform operators read usage cross-tenant (privileged, filtered by id).
    if (isPlatform) {
      const [storeCount] = await this.databaseService.db
        .select({ value: count() })
        .from(stores)
        .where(eq(stores.companyId, companyId));
      const [memberCount] = await this.databaseService.db
        .select({ value: count() })
        .from(memberships)
        .where(eq(memberships.companyId, companyId));
      return { stores: storeCount.value, members: memberCount.value };
    }
    await this.assertMember(companyId, userId);
    return this.databaseService.withTenant(companyId, async (tx) => {
      const [storeCount] = await tx.select({ value: count() }).from(stores);
      const [memberCount] = await tx.select({ value: count() }).from(memberships);
      return { stores: storeCount.value, members: memberCount.value };
    });
  }

  private async findCurrentScoped(companyId: string): Promise<Company> {
    return this.databaseService.withTenant(companyId, async (tx) => {
      const company = await tx.query.companies.findFirst();
      if (!company) throw new NotFoundException('Company not found.');
      return company;
    });
  }

  private async assertMember(companyId: string, userId: string): Promise<void> {
    const membership = await this.databaseService.db.query.memberships.findFirst({
      where: and(
        eq(memberships.companyId, companyId),
        eq(memberships.userId, userId),
        eq(memberships.status, 'active'),
      ),
    });
    if (!membership) {
      throw new ForbiddenException('You are not a member of this company.');
    }
  }
}
