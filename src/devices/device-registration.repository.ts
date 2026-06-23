import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, type SQL } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import {
  deviceRegistrationLogs,
  deviceRegistrations,
  employees,
  memberships,
  type DeviceRegistration,
  type DeviceRegistrationLog,
  type MembershipRole,
  type NewDeviceRegistration,
  type NewDeviceRegistrationLog,
} from '../database/schema';

export interface RegistrationFilters {
  employeeId?: string;
  status?: DeviceRegistration['status'];
}

/** Device-registration + history Drizzle access, RLS-scoped via withTenant. */
@Injectable()
export class DeviceRegistrationRepository {
  constructor(private readonly db: DatabaseService) {}

  list(
    companyId: string,
    filters: RegistrationFilters,
    scopeStoreIds: string[] | null,
  ): Promise<RegistrationWithEmployee[]> {
    const conds: SQL[] = [];
    if (filters.employeeId) conds.push(eq(deviceRegistrations.employeeId, filters.employeeId));
    if (filters.status) conds.push(eq(deviceRegistrations.status, filters.status));
    return this.db.withTenant(companyId, async (tx) => {
      const rows = await tx.query.deviceRegistrations.findMany({
        where: conds.length ? and(...conds) : undefined,
        orderBy: desc(deviceRegistrations.registeredAt),
        with: {
          employee: {
            columns: {
              id: true,
              firstName: true,
              lastName: true,
              uniqueCode: true,
              role: true,
              userId: true,
              primaryStoreId: true,
              avatarUrl: true,
            },
          },
        },
        limit: 500,
      });
      if (!scopeStoreIds) return rows;
      return rows.filter((r) => {
        const sid = r.employee?.primaryStoreId ?? null;
        return sid != null && scopeStoreIds.includes(sid);
      });
    });
  }

  findById(companyId: string, id: string) {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.deviceRegistrations.findFirst({
        where: eq(deviceRegistrations.id, id),
        with: { employee: { columns: { id: true, primaryStoreId: true, userId: true } } },
      }),
    );
  }

  /** The employee's current ACTIVE registration, if any. */
  findActiveForEmployee(companyId: string, employeeId: string) {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.deviceRegistrations.findFirst({
        where: and(
          eq(deviceRegistrations.employeeId, employeeId),
          eq(deviceRegistrations.status, 'active'),
        ),
      }),
    );
  }

  /** The current ACTIVE registration matching a presented device token. */
  findActiveByToken(companyId: string, employeeId: string, deviceToken: string) {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.deviceRegistrations.findFirst({
        where: and(
          eq(deviceRegistrations.employeeId, employeeId),
          eq(deviceRegistrations.deviceToken, deviceToken),
          eq(deviceRegistrations.status, 'active'),
        ),
      }),
    );
  }

  create(companyId: string, values: NewDeviceRegistration): Promise<DeviceRegistration> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx.insert(deviceRegistrations).values(values).returning();
      return row;
    });
  }

  update(
    companyId: string,
    id: string,
    values: Partial<NewDeviceRegistration>,
  ): Promise<DeviceRegistration> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx
        .update(deviceRegistrations)
        .set(values)
        .where(eq(deviceRegistrations.id, id))
        .returning();
      return row;
    });
  }

  addLog(companyId: string, values: NewDeviceRegistrationLog): Promise<DeviceRegistrationLog> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx.insert(deviceRegistrationLogs).values(values).returning();
      return row;
    });
  }

  listLogs(companyId: string, employeeId: string): Promise<DeviceRegistrationLog[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx
        .select()
        .from(deviceRegistrationLogs)
        .where(eq(deviceRegistrationLogs.employeeId, employeeId))
        .orderBy(desc(deviceRegistrationLogs.createdAt))
        .limit(100),
    );
  }

  /** Resolve the employee for the currently-authenticated user in this company. */
  employeeByUser(companyId: string, userId: string) {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.employees.findFirst({
        where: eq(employees.userId, userId),
        columns: { id: true, primaryStoreId: true, firstName: true, lastName: true },
      }),
    );
  }

  employeeById(companyId: string, id: string) {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.employees.findFirst({
        where: eq(employees.id, id),
        columns: { id: true, primaryStoreId: true, firstName: true, lastName: true },
      }),
    );
  }

  /** Maps user ids → their company membership role (the staff "user role"). */
  async membershipRolesByUser(
    companyId: string,
    userIds: string[],
  ): Promise<Map<string, MembershipRole>> {
    if (userIds.length === 0) return new Map();
    return this.db.withTenant(companyId, async (tx) => {
      const rows = await tx
        .select({ userId: memberships.userId, role: memberships.role })
        .from(memberships)
        .where(and(eq(memberships.companyId, companyId), inArray(memberships.userId, userIds)));
      return new Map(rows.map((r) => [r.userId, r.role]));
    });
  }

  // Kept for symmetry; ordered ascending for a chronological export if needed.
  listLogsAsc(companyId: string, employeeId: string): Promise<DeviceRegistrationLog[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx
        .select()
        .from(deviceRegistrationLogs)
        .where(eq(deviceRegistrationLogs.employeeId, employeeId))
        .orderBy(asc(deviceRegistrationLogs.createdAt)),
    );
  }
}

export type RegistrationWithEmployee = DeviceRegistration & {
  employee?: {
    id: string;
    firstName: string;
    lastName: string;
    uniqueCode: string | null;
    role: string | null;
    userId: string | null;
    primaryStoreId: string | null;
    avatarUrl: string | null;
    /** Company membership role (the staff "user role"); attached in the service. */
    membershipRole?: MembershipRole | null;
  } | null;
};
