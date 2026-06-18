import { Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { companies, memberships, type Company } from '../database/schema';
import type { CreateCompanyDto } from './dto/create-company.dto';
import type { UpdateCompanyDto } from './dto/update-company.dto';

/**
 * Company lifecycle. Provisioning (create company + owner membership) is a
 * cross-tenant action and runs on the privileged connection. Reads/updates of
 * the caller's own company go through `withTenant`, so RLS — not just the app —
 * guarantees a tenant can only ever touch its own row.
 */
@Injectable()
export class CompaniesService {
  constructor(private readonly databaseService: DatabaseService) {}

  /** Self-serve signup: create a tenant and make `ownerUserId` its owner. */
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

  /** The caller's own tenant — RLS returns at most this one company. */
  async findCurrent(companyId: string): Promise<Company> {
    return this.databaseService.withTenant(companyId, async (tx) => {
      const company = await tx.query.companies.findFirst();
      if (!company) {
        throw new NotFoundException('Company not found.');
      }
      return company;
    });
  }

  async updateCurrent(companyId: string, dto: UpdateCompanyDto): Promise<Company> {
    const patch = {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.country !== undefined ? { country: dto.country } : {}),
      ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
      ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
    };

    return this.databaseService.withTenant(companyId, async (tx) => {
      const [updated] = await tx
        .update(companies)
        .set(patch)
        .where(eq(companies.id, companyId))
        .returning();
      if (!updated) {
        throw new NotFoundException('Company not found.');
      }
      return updated;
    });
  }
}
