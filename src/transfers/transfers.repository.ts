import { Injectable } from '@nestjs/common';
import { and, desc, eq, lte, type SQL } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import {
  employeeStores,
  employees,
  transfers,
  type Employee,
  type EmployeeStore,
  type NewEmployeeStore,
  type NewTransfer,
  type Transfer,
} from '../database/schema';

const EMPLOYEE_COLS = {
  id: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  uniqueCode: true,
  primaryStoreId: true,
} as const;

/** All transfer Drizzle access, RLS-scoped via DatabaseService.withTenant. */
@Injectable()
export class TransfersRepository {
  constructor(private readonly db: DatabaseService) {}

  list(
    companyId: string,
    filters: { employeeId?: string; status?: Transfer['status']; kind?: Transfer['kind'] },
  ): Promise<Transfer[]> {
    const conds: SQL[] = [];
    if (filters.employeeId) conds.push(eq(transfers.employeeId, filters.employeeId));
    if (filters.status) conds.push(eq(transfers.status, filters.status));
    if (filters.kind) conds.push(eq(transfers.kind, filters.kind));
    return this.db.withTenant(companyId, (tx) =>
      tx.query.transfers.findMany({
        where: conds.length ? and(...conds) : undefined,
        orderBy: desc(transfers.createdAt),
        with: {
          employee: { columns: EMPLOYEE_COLS },
          fromStore: { columns: { id: true, name: true } },
          toStore: { columns: { id: true, name: true } },
        },
        limit: 500,
      }),
    );
  }

  find(companyId: string, id: string) {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.transfers.findFirst({
        where: eq(transfers.id, id),
        with: {
          employee: { columns: EMPLOYEE_COLS },
          fromStore: { columns: { id: true, name: true } },
          toStore: { columns: { id: true, name: true } },
        },
      }),
    );
  }

  create(companyId: string, values: NewTransfer): Promise<Transfer> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx.insert(transfers).values(values).returning();
      return row;
    });
  }

  update(companyId: string, id: string, values: Partial<NewTransfer>): Promise<Transfer> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx.update(transfers).set(values).where(eq(transfers.id, id)).returning();
      return row;
    });
  }

  /** Approved temporary transfers whose start date has arrived but aren't active yet. */
  dueToActivate(companyId: string, today: string): Promise<Transfer[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.transfers.findMany({
        where: and(
          eq(transfers.kind, 'temporary'),
          eq(transfers.status, 'approved'),
          lte(transfers.startDate, today),
        ),
      }),
    );
  }

  /** Active temporary transfers whose end date has passed → auto-revert. */
  dueToRevert(companyId: string, today: string): Promise<Transfer[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.transfers.findMany({
        where: and(
          eq(transfers.kind, 'temporary'),
          eq(transfers.status, 'active'),
          lte(transfers.endDate, today),
        ),
      }),
    );
  }

  // ── employee + store link mutations ──────────────────────────────────────────
  findEmployee(companyId: string, id: string): Promise<Employee | undefined> {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.employees.findFirst({ where: eq(employees.id, id) }),
    );
  }

  setPrimaryStore(companyId: string, employeeId: string, storeId: string): Promise<void> {
    return this.db.withTenant(companyId, async (tx) => {
      await tx
        .update(employees)
        .set({ primaryStoreId: storeId })
        .where(eq(employees.id, employeeId));
    });
  }

  addLink(companyId: string, values: NewEmployeeStore): Promise<EmployeeStore> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx
        .insert(employeeStores)
        .values(values)
        .onConflictDoUpdate({
          target: [employeeStores.employeeId, employeeStores.storeId],
          set: { active: true, relation: values.relation ?? 'guest' },
        })
        .returning();
      return row;
    });
  }

  removeLink(companyId: string, id: string): Promise<void> {
    return this.db.withTenant(companyId, async (tx) => {
      await tx.delete(employeeStores).where(eq(employeeStores.id, id));
    });
  }
}
