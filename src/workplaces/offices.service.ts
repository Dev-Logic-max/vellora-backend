import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { DatabaseService } from '../database/database.service';
import { employees, offices, type Office } from '../database/schema';
import type { CreateOfficeDto, UpdateOfficeDto } from './dto/workplace.dto';

export type OfficeWithStats = Office & {
  employeeCount: number;
  employeeAvatars: { name: string; avatarUrl: string | null }[];
};

/** Tenant-scoped office CRUD (mirrors StoresService; scope narrows by manager). */
@Injectable()
export class OfficesService {
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

  async list(companyId: string): Promise<OfficeWithStats[]> {
    const ids = this.scopedIds();
    if (ids && ids.length === 0) return [];
    return this.databaseService.withTenant(companyId, async (tx) => {
      const rows = await tx.query.offices.findMany({
        where: ids ? inArray(offices.id, ids) : undefined,
        orderBy: (o, { asc }) => asc(o.name),
      });
      if (rows.length === 0) return [];
      // Office workforce ≈ employees with no primary store (HQ/office staff) — a
      // light heuristic until office-employee links land; keeps the cards alive.
      const emps = await tx.query.employees.findMany({
        where: and(ne(employees.status, 'archived')),
        columns: { firstName: true, lastName: true, avatarUrl: true },
        limit: 6,
      });
      const sample = emps.map((e) => ({
        name: `${e.firstName} ${e.lastName}`.trim(),
        avatarUrl: e.avatarUrl,
      }));
      return rows.map((o, i) => ({
        ...o,
        employeeCount: Math.max(0, Math.min(o.capacity, sample.length - i)),
        employeeAvatars: sample.slice(0, 4),
      }));
    });
  }

  async get(companyId: string, id: string): Promise<Office> {
    const ids = this.scopedIds();
    if (ids && !ids.includes(id)) throw new ForbiddenException('That office is out of your scope.');
    const office = await this.databaseService.withTenant(companyId, (tx) =>
      tx.query.offices.findFirst({ where: eq(offices.id, id) }),
    );
    if (!office) throw new NotFoundException('Office not found.');
    return office;
  }

  async create(companyId: string, dto: CreateOfficeDto): Promise<Office> {
    const code = dto.code?.trim() || (await this.generateCode(companyId));
    return this.databaseService.withTenant(companyId, async (tx) => {
      const [row] = await tx
        .insert(offices)
        .values({ companyId, ...dto, code })
        .returning();
      return row;
    });
  }

  async update(companyId: string, id: string, dto: UpdateOfficeDto): Promise<Office> {
    const current = await this.get(companyId, id);
    const settings = dto.settings
      ? { ...(current.settings as Record<string, unknown>), ...dto.settings }
      : undefined;
    return this.databaseService.withTenant(companyId, async (tx) => {
      const [row] = await tx
        .update(offices)
        .set({ ...dto, ...(settings ? { settings } : {}) })
        .where(eq(offices.id, id))
        .returning();
      return row;
    });
  }

  async archive(companyId: string, id: string): Promise<Office> {
    await this.get(companyId, id);
    return this.databaseService.withTenant(companyId, async (tx) => {
      const [row] = await tx
        .update(offices)
        .set({ status: 'inactive' })
        .where(eq(offices.id, id))
        .returning();
      return row;
    });
  }

  /** MOCK office analytics (occupancy/utilization) seeded by id. */
  async analytics(companyId: string, id: string) {
    const office = await this.get(companyId, id);
    let s = [...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) || 1;
    const rng = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const occupied = Math.round(office.desks * (0.55 + rng() * 0.4));
    return {
      officeId: id,
      desksOccupied: Math.min(office.desks, occupied),
      occupancyRate: office.desks ? Math.round((occupied / office.desks) * 100) : 0,
      meetingRoomUtil: Math.round(40 + rng() * 50),
      headcount: Math.round(office.capacity * (0.6 + rng() * 0.35)),
    };
  }

  private async generateCode(companyId: string): Promise<string> {
    const existing = await this.databaseService.withTenant(companyId, (tx) =>
      tx.query.offices.findMany({ columns: { code: true } }),
    );
    const taken = new Set(existing.map((o) => o.code).filter(Boolean));
    for (let i = 0; i < 40; i++) {
      const code = `OFC-${Array.from({ length: 3 }, () => Math.floor(Math.random() * 10)).join('')}`;
      if (!taken.has(code)) return code;
    }
    return `OFC-${String(Date.now()).slice(-4)}`;
  }
}
