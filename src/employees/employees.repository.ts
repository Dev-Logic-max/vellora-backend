import { Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, ilike, inArray, isNull, or, type SQL } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import {
  contracts,
  employeeBankAccounts,
  employeeStores,
  employees,
  empPreferences,
  medicals,
  memberships,
  qualifications,
  stores,
  users,
  type Contract,
  type EmployeeBankAccount,
  type NewEmployeeBankAccount,
  type Employee,
  type EmployeeStore,
  type Medical,
  type NewContract,
  type NewEmployee,
  type NewMedical,
  type NewQualification,
  type Qualification,
} from '../database/schema';
import type { MembershipRole } from '../database/schema/enums';

/** An employee row enriched with the user's company membership role (the
 * platform-plane "user role"), distinct from the free-text job title in `role`. */
export type EmployeeWithMembership = Employee & { membershipRole: MembershipRole | null };

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
  ): Promise<{ rows: EmployeeWithMembership[]; total: number }> {
    const where = this.listWhere(filters, scopeStoreIds);
    return this.db.withTenant(companyId, async (tx) => {
      // Left-join the user's membership (same tenant via RLS) to surface the
      // company "user role" alongside the employee's free-text job title.
      const rows = await tx
        .select({ employee: employees, membershipRole: memberships.role })
        .from(employees)
        .leftJoin(
          memberships,
          and(
            eq(memberships.userId, employees.userId),
            eq(memberships.companyId, employees.companyId),
          ),
        )
        .where(where)
        .orderBy(asc(employees.lastName), asc(employees.firstName))
        .limit(filters.pageSize)
        .offset((filters.page - 1) * filters.pageSize);
      const [{ value }] = await tx.select({ value: count() }).from(employees).where(where);
      return {
        rows: rows.map((r) => ({ ...r.employee, membershipRole: r.membershipRole })),
        total: Number(value),
      };
    });
  }

  /** Every non-archived employee in scope (used for CSV export). */
  exportAll(companyId: string, scopeStoreIds: string[] | null): Promise<Employee[]> {
    const where = scopeStoreIds ? inArray(employees.primaryStoreId, scopeStoreIds) : undefined;
    return this.db.withTenant(companyId, (tx) =>
      tx.select().from(employees).where(where).orderBy(asc(employees.uniqueCode)),
    );
  }

  /**
   * Users in this company whose membership role sits above Employee — the pool
   * of eligible supervisors. Joins `users` to surface a display name + email.
   */
  listSupervisorCandidates(companyId: string) {
    const supervisorRoles: MembershipRole[] = ['owner', 'hr', 'area_manager', 'store_manager'];
    return this.db.withTenant(companyId, (tx) =>
      tx
        .select({
          userId: memberships.userId,
          role: memberships.role,
          name: users.name,
          email: users.email,
          avatarUrl: users.avatarUrl,
        })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(and(eq(memberships.status, 'active'), inArray(memberships.role, supervisorRoles)))
        .orderBy(asc(users.name)),
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

  /** The user's company membership role (the "user role"), or null. */
  async membershipRoleForUser(
    companyId: string,
    userId: string | null,
  ): Promise<MembershipRole | null> {
    if (!userId) return null;
    const row = await this.db.withTenant(companyId, (tx) =>
      tx.query.memberships.findFirst({
        where: and(eq(memberships.userId, userId), eq(memberships.companyId, companyId)),
        columns: { role: true },
      }),
    );
    return row?.role ?? null;
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

  /** Hard-delete an employee (cascade removes their sub-rows via FK). */
  remove(companyId: string, id: string): Promise<void> {
    return this.db.withTenant(companyId, async (tx) => {
      await tx.delete(employees).where(eq(employees.id, id));
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

  // ── bank accounts ─────────────────────────────────────────────────────────
  listBankAccounts(companyId: string, employeeId: string): Promise<EmployeeBankAccount[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.employeeBankAccounts.findMany({
        where: eq(employeeBankAccounts.employeeId, employeeId),
        orderBy: desc(employeeBankAccounts.isPrimary),
      }),
    );
  }

  addBankAccount(companyId: string, values: NewEmployeeBankAccount): Promise<EmployeeBankAccount> {
    return this.db.withTenant(companyId, async (tx) => {
      // A newly-primary account demotes the others.
      if (values.isPrimary) {
        await tx
          .update(employeeBankAccounts)
          .set({ isPrimary: false })
          .where(eq(employeeBankAccounts.employeeId, values.employeeId));
      }
      const [row] = await tx.insert(employeeBankAccounts).values(values).returning();
      return row;
    });
  }

  removeBankAccount(companyId: string, employeeId: string, accountId: string): Promise<void> {
    return this.db.withTenant(companyId, async (tx) => {
      await tx
        .delete(employeeBankAccounts)
        .where(
          and(
            eq(employeeBankAccounts.id, accountId),
            eq(employeeBankAccounts.employeeId, employeeId),
          ),
        );
    });
  }

  // ── contracts (managed lifecycle) ─────────────────────────────────────────
  /** Non-deleted contracts (active + cancelled), newest first. */
  listContracts(companyId: string, employeeId: string): Promise<Contract[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.contracts.findMany({
        where: and(eq(contracts.employeeId, employeeId), isNull(contracts.deletedAt)),
        orderBy: desc(contracts.startDate),
      }),
    );
  }

  findContract(companyId: string, employeeId: string, contractId: string) {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.contracts.findFirst({
        where: and(
          eq(contracts.id, contractId),
          eq(contracts.employeeId, employeeId),
          isNull(contracts.deletedAt),
        ),
      }),
    );
  }

  addContract(companyId: string, values: NewContract): Promise<Contract> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx.insert(contracts).values(values).returning();
      return row;
    });
  }

  updateContract(
    companyId: string,
    contractId: string,
    values: Partial<NewContract>,
  ): Promise<Contract> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx
        .update(contracts)
        .set(values)
        .where(eq(contracts.id, contractId))
        .returning();
      return row;
    });
  }

  /** Soft-delete a contract (permanent removal from the user's perspective). */
  softDeleteContract(companyId: string, contractId: string): Promise<void> {
    return this.db.withTenant(companyId, async (tx) => {
      await tx.update(contracts).set({ deletedAt: new Date() }).where(eq(contracts.id, contractId));
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
