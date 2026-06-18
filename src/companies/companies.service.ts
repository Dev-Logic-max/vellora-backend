import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, count, eq } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import {
  companies,
  memberships,
  stores,
  type Company,
  type MembershipRole,
} from '../database/schema';
import type { CreateCompanyDto } from './dto/create-company.dto';
import type { UpdateCompanyDto } from './dto/update-company.dto';

export interface CompanyWithRole extends Company {
  role: MembershipRole;
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
    return this.databaseService.db.transaction(async (tx) => {
      const [company] = await tx
        .insert(companies)
        .values({
          name: dto.name,
          ...(dto.country ? { country: dto.country } : {}),
          ...(dto.currency ? { currency: dto.currency } : {}),
          ...(dto.timezone ? { timezone: dto.timezone } : {}),
          groupId: dto.groupId ?? null,
        })
        .returning();

      await tx.insert(memberships).values({
        userId: ownerUserId,
        companyId: company.id,
        role: 'owner',
        scopeType: 'company',
        scopeIds: [],
        status: 'active',
      });

      return company;
    });
  }

  /** Companies the user is an active member of (cross-tenant; privileged). */
  async listForUser(userId: string): Promise<CompanyWithRole[]> {
    const rows = await this.databaseService.db
      .select({ company: companies, role: memberships.role })
      .from(memberships)
      .innerJoin(companies, eq(companies.id, memberships.companyId))
      .where(and(eq(memberships.userId, userId), eq(memberships.status, 'active')));
    return rows.map((row) => ({ ...row.company, role: row.role }));
  }

  /** The caller's active tenant — RLS returns at most this one company. */
  async findCurrent(companyId: string): Promise<Company> {
    return this.databaseService.withTenant(companyId, async (tx) => {
      const company = await tx.query.companies.findFirst();
      if (!company) throw new NotFoundException('Company not found.');
      return company;
    });
  }

  async getById(companyId: string, userId: string): Promise<Company> {
    await this.assertMember(companyId, userId);
    return this.findCurrentScoped(companyId);
  }

  async update(companyId: string, userId: string, dto: UpdateCompanyDto): Promise<Company> {
    await this.assertMember(companyId, userId);
    const patch = {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.country !== undefined ? { country: dto.country } : {}),
      ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
      ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
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

  async usage(companyId: string, userId: string) {
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
