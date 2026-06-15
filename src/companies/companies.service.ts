import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDB } from '../database/drizzle.types';
import { companies, type Company } from '../database/schema';
import type { CreateCompanyDto } from './dto/create-company.dto';
import type { UpdateCompanyDto } from './dto/update-company.dto';

/**
 * CRUD scaffold for tenant root records. Company lifecycle is a privileged
 * (super_admin) concern, so these methods are NOT tenant-scoped the way other
 * resources are — callers must be authorized accordingly at the controller.
 */
@Injectable()
export class CompaniesService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async create(dto: CreateCompanyDto): Promise<Company> {
    const slug = dto.slug ?? this.slugify(dto.name);

    const existing = await this.db.query.companies.findFirst({
      where: eq(companies.slug, slug),
    });
    if (existing) {
      throw new ConflictException(`A company with slug "${slug}" already exists.`);
    }

    const [created] = await this.db.insert(companies).values({ name: dto.name, slug }).returning();
    return created;
  }

  findAll(): Promise<Company[]> {
    return this.db.query.companies.findMany({ orderBy: (c, { asc }) => asc(c.name) });
  }

  async findOne(id: string): Promise<Company> {
    const company = await this.db.query.companies.findFirst({ where: eq(companies.id, id) });
    if (!company) {
      throw new NotFoundException(`Company ${id} was not found.`);
    }
    return company;
  }

  async update(id: string, dto: UpdateCompanyDto): Promise<Company> {
    await this.findOne(id);
    const [updated] = await this.db
      .update(companies)
      .set({ ...dto })
      .where(eq(companies.id, id))
      .returning();
    return updated;
  }

  async remove(id: string): Promise<void> {
    const [deleted] = await this.db
      .delete(companies)
      .where(eq(companies.id, id))
      .returning({ id: companies.id });
    if (!deleted) {
      throw new NotFoundException(`Company ${id} was not found.`);
    }
  }

  private slugify(value: string): string {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}
