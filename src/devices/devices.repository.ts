import { Injectable } from '@nestjs/common';
import { and, asc, eq, ilike, inArray, type SQL } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import {
  devices,
  employees,
  terminals,
  type Device,
  type NewDevice,
  type NewTerminal,
  type Terminal,
} from '../database/schema';

export interface DeviceFilters {
  storeId?: string;
  employeeId?: string;
  status?: Device['status'];
  q?: string;
}

/** Devices + terminals Drizzle access, RLS-scoped via DatabaseService.withTenant. */
@Injectable()
export class DevicesRepository {
  constructor(private readonly db: DatabaseService) {}

  // ── devices ──────────────────────────────────────────────────────────────
  listDevices(
    companyId: string,
    filters: DeviceFilters,
    scopeStoreIds: string[] | null,
  ): Promise<Device[]> {
    const conds: SQL[] = [];
    if (filters.employeeId) conds.push(eq(devices.employeeId, filters.employeeId));
    if (filters.status) conds.push(eq(devices.status, filters.status));
    if (filters.q) conds.push(ilike(devices.label, `%${filters.q}%`));
    // Store scope is applied via the employee's primary store below.
    return this.db.withTenant(companyId, async (tx) => {
      const rows = await tx.query.devices.findMany({
        where: conds.length ? and(...conds) : undefined,
        orderBy: asc(devices.createdAt),
        with: {
          employee: {
            columns: {
              id: true,
              firstName: true,
              lastName: true,
              uniqueCode: true,
              role: true,
              primaryStoreId: true,
            },
          },
        },
        limit: 500,
      });
      if (!scopeStoreIds && !filters.storeId) return rows;
      return rows.filter((d) => {
        const sid = d.employee?.primaryStoreId ?? null;
        if (filters.storeId && sid !== filters.storeId) return false;
        if (scopeStoreIds && (!sid || !scopeStoreIds.includes(sid))) return false;
        return true;
      });
    });
  }

  findDevice(companyId: string, id: string) {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.devices.findFirst({
        where: eq(devices.id, id),
        with: { employee: { columns: { id: true, primaryStoreId: true } } },
      }),
    );
  }

  countActiveDevices(companyId: string, employeeId: string): Promise<number> {
    return this.db.withTenant(companyId, async (tx) => {
      const rows = await tx
        .select({ id: devices.id })
        .from(devices)
        .where(
          and(
            eq(devices.employeeId, employeeId),
            inArray(devices.status, ['pending', 'registered']),
          ),
        );
      return rows.length;
    });
  }

  createDevice(companyId: string, values: NewDevice): Promise<Device> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx.insert(devices).values(values).returning();
      return row;
    });
  }

  updateDevice(companyId: string, id: string, values: Partial<NewDevice>): Promise<Device> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx.update(devices).set(values).where(eq(devices.id, id)).returning();
      return row;
    });
  }

  // ── terminals ────────────────────────────────────────────────────────────
  listTerminals(companyId: string, scopeStoreIds: string[] | null): Promise<Terminal[]> {
    const where = scopeStoreIds ? inArray(terminals.storeId, scopeStoreIds) : undefined;
    return this.db.withTenant(companyId, (tx) =>
      tx.select().from(terminals).where(where).orderBy(asc(terminals.label)),
    );
  }

  findTerminal(companyId: string, id: string) {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.terminals.findFirst({ where: eq(terminals.id, id) }),
    );
  }

  /** The single terminal bound to a store, if one exists (one-per-store). */
  findTerminalByStore(companyId: string, storeId: string) {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.terminals.findFirst({ where: eq(terminals.storeId, storeId) }),
    );
  }

  deleteTerminal(companyId: string, id: string): Promise<void> {
    return this.db.withTenant(companyId, async (tx) => {
      await tx.delete(terminals).where(eq(terminals.id, id));
    });
  }

  createTerminal(companyId: string, values: NewTerminal): Promise<Terminal> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx.insert(terminals).values(values).returning();
      return row;
    });
  }

  updateTerminal(companyId: string, id: string, values: Partial<NewTerminal>): Promise<Terminal> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx.update(terminals).set(values).where(eq(terminals.id, id)).returning();
      return row;
    });
  }

  employeeById(companyId: string, id: string) {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.employees.findFirst({
        where: eq(employees.id, id),
        columns: { id: true, primaryStoreId: true },
      }),
    );
  }
}
