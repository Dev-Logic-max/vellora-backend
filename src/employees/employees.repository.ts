import { Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, ilike, inArray, or, type SQL } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import {
  contracts,
  employeeStores,
  employees,
  empPreferences,
  medicals,
  qualifications,
  stores,
  type Contract,
  type Employee,
  type EmployeeStore,
  type Medical,
  type NewContract,
  type NewEmployee,
  type NewMedical,
  type NewQualification,
  type Qualification,
} from '../database/schema';

export interface EmployeeFilters {
  page: number;
  pageSize: number;
  storeId?: string;
  role?: string;
  status?: Employee['status'];
  q?: string;
}

/** All employee-domain Drizzle access, RLS-scoped via DatabaseService.withTenant. */
@Injectable()
export class EmployeesRepository {
  constructor(private readonly db: DatabaseService) {}

  private listWhere(filters: EmployeeFilters, scopeStoreIds: string[] | null): SQL | undefined {
    const conds: (SQL | undefined)[] = [];
    if (scopeStoreIds) conds.push(inArray(employees.primaryStoreId, scopeStoreIds));
    if (filters.storeId) conds.push(eq(employees.primaryStoreId, filters.storeId));
    if (filters.role) conds.push(eq(employees.role, filters.role));
    if (filters.status) conds.push(eq(employees.status, filters.status));
    if (filters.q) {
      const term = `%${filters.q}%`;
      conds.push(
        or(
          ilike(employees.firstName, term),
          ilike(employees.lastName, term),
          ilike(employees.email, term),
          ilike(employees.uniqueCode, term),
        ),
      );
    }
    const defined = conds.filter((c): c is SQL => c !== undefined);
    return defined.length ? and(...defined) : undefined;
  }

  async list(
    companyId: string,
    filters: EmployeeFilters,
    scopeStoreIds: string[] | null,
  ): Promise<{ rows: Employee[]; total: number }> {
    const where = this.listWhere(filters, scopeStoreIds);
    return this.db.withTenant(companyId, async (tx) => {
      const rows = await tx
        .select()
        .from(employees)
        .where(where)
        .orderBy(asc(employees.lastName), asc(employees.firstName))
        .limit(filters.pageSize)
        .offset((filters.page - 1) * filters.pageSize);
      const [{ value }] = await tx.select({ value: count() }).from(employees).where(where);
      return { rows, total: Number(value) };
    });
  }

  /** Every non-archived employee in scope (used for CSV export). */
  exportAll(companyId: string, scopeStoreIds: string[] | null): Promise<Employee[]> {
    const where = scopeStoreIds ? inArray(employees.primaryStoreId, scopeStoreIds) : undefined;
    return this.db.withTenant(companyId, (tx) =>
      tx.select().from(employees).where(where).orderBy(asc(employees.uniqueCode)),
    );
  }

  async storeCode(companyId: string, storeId: string): Promise<string | null> {
    const row = await this.db.withTenant(companyId, (tx) =>
      tx.select({ code: stores.code }).from(stores).where(eq(stores.id, storeId)).limit(1),
    );
    return row[0]?.code ?? null;
  }

  findById(companyId: string, id: string): Promise<Employee | undefined> {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.employees.findFirst({ where: eq(employees.id, id) }),
    );
  }

  /** Full profile aggregate: employee + primary store + secondary links. */
  findDetail(companyId: string, id: string) {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.employees.findFirst({
        where: eq(employees.id, id),
        with: {
          primaryStore: { columns: { id: true, name: true, code: true, timezone: true } },
          storeLinks: { with: { store: { columns: { id: true, name: true, code: true } } } },
        },
      }),
    );
  }

  /** Highest numeric suffix already used for this company's codes (for auto-numbering). */
  async maxCodeSeq(companyId: string, prefix: string): Promise<number> {
    const rows = await this.db.withTenant(companyId, (tx) =>
      tx.select({ code: employees.uniqueCode }).from(employees),
    );
    let max = 0;
    const re = new RegExp(`^${prefix}-(\\d+)$`);
    for (const { code } of rows) {
      const m = re.exec(code);
      if (m) max = Math.max(max, Number(m[1]));
    }
    return max;
  }

  create(
    companyId: string,
    values: NewEmployee,
    links: { storeId: string; relation: EmployeeStore['relation'] }[],
  ): Promise<Employee> {
    return this.db.withTenant(companyId, async (tx) => {
      const [created] = await tx.insert(employees).values(values).returning();
      if (links.length) {
        await tx
          .insert(employeeStores)
          .values(links.map((l) => ({ companyId, employeeId: created.id, ...l })));
      }
      return created;
    });
  }

  update(companyId: string, id: string, values: Partial<NewEmployee>): Promise<Employee> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx.update(employees).set(values).where(eq(employees.id, id)).returning();
      return row;
    });
  }

  // ── secondary store links ───────────────────────────────────────────────
  listLinks(companyId: string, employeeId: string): Promise<EmployeeStore[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.employeeStores.findMany({ where: eq(employeeStores.employeeId, employeeId) }),
    );
  }

  addLink(
    companyId: string,
    employeeId: string,
    link: { storeId: string; relation: EmployeeStore['relation']; active?: boolean },
  ): Promise<EmployeeStore> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx
        .insert(employeeStores)
        .values({ companyId, employeeId, ...link })
        .onConflictDoUpdate({
          target: [employeeStores.employeeId, employeeStores.storeId],
          set: { relation: link.relation, active: link.active ?? true },
        })
        .returning();
      return row;
    });
  }

  removeLink(companyId: string, employeeId: string, storeId: string): Promise<void> {
    return this.db.withTenant(companyId, async (tx) => {
      await tx
        .delete(employeeStores)
        .where(and(eq(employeeStores.employeeId, employeeId), eq(employeeStores.storeId, storeId)));
    });
  }

  // ── sub-resources ───────────────────────────────────────────────────────
  listContracts(companyId: string, employeeId: string): Promise<Contract[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.contracts.findMany({
        where: eq(contracts.employeeId, employeeId),
        orderBy: desc(contracts.startDate),
      }),
    );
  }

  addContract(companyId: string, values: NewContract): Promise<Contract> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx.insert(contracts).values(values).returning();
      return row;
    });
  }

  listQualifications(companyId: string, employeeId: string): Promise<Qualification[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.qualifications.findMany({ where: eq(qualifications.employeeId, employeeId) }),
    );
  }

  addQualification(companyId: string, values: NewQualification): Promise<Qualification> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx.insert(qualifications).values(values).returning();
      return row;
    });
  }

  listMedicals(companyId: string, employeeId: string): Promise<Medical[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.medicals.findMany({ where: eq(medicals.employeeId, employeeId) }),
    );
  }

  addMedical(companyId: string, values: NewMedical): Promise<Medical> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx.insert(medicals).values(values).returning();
      return row;
    });
  }

  getPreferences(companyId: string, employeeId: string) {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.empPreferences.findFirst({ where: eq(empPreferences.employeeId, employeeId) }),
    );
  }

  upsertPreferences(
    companyId: string,
    employeeId: string,
    values: { availability?: unknown; notifPrefs?: unknown; uiPrefs?: unknown },
  ) {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx
        .insert(empPreferences)
        .values({ companyId, employeeId, ...values })
        .onConflictDoUpdate({ target: empPreferences.employeeId, set: { ...values } })
        .returning();
      return row;
    });
  }
}
