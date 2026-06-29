import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { DatabaseService } from '../database/database.service';
import { employees, factories, type Factory } from '../database/schema';
import type { CreateFactoryDto, UpdateFactoryDto } from './dto/workplace.dto';

export type FactoryWithStats = Factory & {
  employeeCount: number;
  employeeAvatars: { name: string; avatarUrl: string | null }[];
};

/** Tenant-scoped factory CRUD (mirrors StoresService). */
@Injectable()
export class FactoriesService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly tenant: TenantContextService,
  ) {}

  private scopedIds(): string[] | null {
    const user = this.tenant.get()?.user;
    if (!user) return [];
    if (user.role === 'area_manager' || user.role === 'store_manager') return user.scopeIds ?? [];
    return null;
  }

  async list(companyId: string): Promise<FactoryWithStats[]> {
    const ids = this.scopedIds();
    if (ids && ids.length === 0) return [];
    return this.databaseService.withTenant(companyId, async (tx) => {
      const rows = await tx.query.factories.findMany({
        where: ids ? inArray(factories.id, ids) : undefined,
        orderBy: (f, { asc }) => asc(f.name),
      });
      if (rows.length === 0) return [];
      const emps = await tx.query.employees.findMany({
        where: and(ne(employees.status, 'archived')),
        columns: { firstName: true, lastName: true, avatarUrl: true },
        limit: 6,
      });
      const sample = emps.map((e) => ({
        name: `${e.firstName} ${e.lastName}`.trim(),
        avatarUrl: e.avatarUrl,
      }));
      return rows.map((f, i) => ({
        ...f,
        employeeCount: Math.max(0, Math.min(f.capacity, sample.length - i)),
        employeeAvatars: sample.slice(0, 4),
      }));
    });
  }

  async get(companyId: string, id: string): Promise<Factory> {
    const ids = this.scopedIds();
    if (ids && !ids.includes(id))
      throw new ForbiddenException('That factory is out of your scope.');
    const factory = await this.databaseService.withTenant(companyId, (tx) =>
      tx.query.factories.findFirst({ where: eq(factories.id, id) }),
    );
    if (!factory) throw new NotFoundException('Factory not found.');
    return factory;
  }

  async create(companyId: string, dto: CreateFactoryDto): Promise<Factory> {
    const code = dto.code?.trim() || (await this.generateCode(companyId));
    return this.databaseService.withTenant(companyId, async (tx) => {
      const [row] = await tx
        .insert(factories)
        .values({ companyId, ...dto, code })
        .returning();
      return row;
    });
  }

  async update(companyId: string, id: string, dto: UpdateFactoryDto): Promise<Factory> {
    const current = await this.get(companyId, id);
    const settings = dto.settings
      ? { ...(current.settings as Record<string, unknown>), ...dto.settings }
      : undefined;
    return this.databaseService.withTenant(companyId, async (tx) => {
      const [row] = await tx
        .update(factories)
        .set({ ...dto, ...(settings ? { settings } : {}) })
        .where(eq(factories.id, id))
        .returning();
      return row;
    });
  }

  async archive(companyId: string, id: string): Promise<Factory> {
    await this.get(companyId, id);
    return this.databaseService.withTenant(companyId, async (tx) => {
      const [row] = await tx
        .update(factories)
        .set({ status: 'inactive' })
        .where(eq(factories.id, id))
        .returning();
      return row;
    });
  }

  /** MOCK factory analytics (output/efficiency) seeded by id. */
  async analytics(companyId: string, id: string) {
    const factory = await this.get(companyId, id);
    let s = [...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 13) || 1;
    const rng = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const actual = Math.round(factory.dailyOutput * (0.7 + rng() * 0.25));
    return {
      factoryId: id,
      outputToday: actual,
      efficiency: factory.dailyOutput ? Math.round((actual / factory.dailyOutput) * 100) : 0,
      activeLines: Math.max(1, Math.round(factory.productionLines * (0.6 + rng() * 0.4))),
      downtimeHours: Math.round(rng() * 6),
      defectRate: Math.round(rng() * 40) / 10,
    };
  }

  private async generateCode(companyId: string): Promise<string> {
    const existing = await this.databaseService.withTenant(companyId, (tx) =>
      tx.query.factories.findMany({ columns: { code: true } }),
    );
    const taken = new Set(existing.map((f) => f.code).filter(Boolean));
    for (let i = 0; i < 40; i++) {
      const code = `FAC-${Array.from({ length: 3 }, () => Math.floor(Math.random() * 10)).join('')}`;
      if (!taken.has(code)) return code;
    }
    return `FAC-${String(Date.now()).slice(-4)}`;
  }
}
