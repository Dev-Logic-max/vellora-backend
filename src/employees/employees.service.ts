import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDB } from '../database/drizzle.types';
import { users, type User } from '../database/schema';
import type { CreateEmployeeDto } from './dto/create-employee.dto';
import type { UpdateEmployeeDto } from './dto/update-employee.dto';

/**
 * CRUD scaffold for tenant-scoped employees (rows in `users`). Every query is
 * narrowed to the active tenant resolved from the request's TenantContext, so
 * one company can never read or mutate another's employees.
 */
@Injectable()
export class EmployeesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly tenantContext: TenantContextService,
  ) {}

  private get companyId(): string {
    return this.tenantContext.getCompanyId();
  }

  async create(dto: CreateEmployeeDto): Promise<User> {
    const companyId = this.companyId;

    const existing = await this.db.query.users.findFirst({
      where: and(eq(users.companyId, companyId), eq(users.email, dto.email)),
    });
    if (existing) {
      throw new ConflictException(`An employee with email "${dto.email}" already exists.`);
    }

    const [created] = await this.db
      .insert(users)
      .values({
        companyId,
        email: dto.email,
        fullName: dto.fullName,
        role: dto.role ?? 'employee',
        supabaseUserId: dto.supabaseUserId,
        isActive: dto.isActive ?? true,
      })
      .returning();
    return created;
  }

  findAll(): Promise<User[]> {
    return this.db.query.users.findMany({
      where: eq(users.companyId, this.companyId),
      orderBy: (u, { asc }) => asc(u.email),
    });
  }

  async findOne(id: string): Promise<User> {
    const employee = await this.db.query.users.findFirst({
      where: and(eq(users.id, id), eq(users.companyId, this.companyId)),
    });
    if (!employee) {
      throw new NotFoundException(`Employee ${id} was not found.`);
    }
    return employee;
  }

  async update(id: string, dto: UpdateEmployeeDto): Promise<User> {
    await this.findOne(id);
    const [updated] = await this.db
      .update(users)
      .set({ ...dto })
      .where(and(eq(users.id, id), eq(users.companyId, this.companyId)))
      .returning();
    return updated;
  }

  async remove(id: string): Promise<void> {
    const [deleted] = await this.db
      .delete(users)
      .where(and(eq(users.id, id), eq(users.companyId, this.companyId)))
      .returning({ id: users.id });
    if (!deleted) {
      throw new NotFoundException(`Employee ${id} was not found.`);
    }
  }
}
