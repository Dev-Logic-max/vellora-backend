import { Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import {
  activationRequests,
  employees,
  memberships,
  users,
  type ActivationRequest,
  type NewActivationRequest,
} from '../database/schema';
import type { MembershipRole } from '../database/schema/enums';

/** An activation request enriched with the linked employee's display fields. */
export type ActivationRequestRow = ActivationRequest & {
  employeeName: string | null;
  uniqueCode: string | null;
};

/**
 * Data access for the user-activation workflow. Tenant reads/writes on
 * `activation_requests` go through RLS (withTenant); creating the actual
 * user + membership at approval time uses the privileged connection (those are
 * cross-cutting/global tables), mirroring companies.createWithOwner.
 */
@Injectable()
export class ActivationRequestsRepository {
  constructor(private readonly db: DatabaseService) {}

  list(companyId: string, status?: ActivationRequest['status']): Promise<ActivationRequestRow[]> {
    return this.db.withTenant(companyId, async (tx) => {
      const rows = await tx
        .select({
          req: activationRequests,
          firstName: employees.firstName,
          lastName: employees.lastName,
          uniqueCode: employees.uniqueCode,
        })
        .from(activationRequests)
        .leftJoin(employees, eq(employees.id, activationRequests.employeeId))
        .where(
          status
            ? and(
                eq(activationRequests.companyId, companyId),
                eq(activationRequests.status, status),
              )
            : eq(activationRequests.companyId, companyId),
        )
        .orderBy(desc(activationRequests.createdAt));
      return rows.map((r) => ({
        ...r.req,
        employeeName:
          r.firstName || r.lastName ? `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim() : null,
        uniqueCode: r.uniqueCode ?? null,
      }));
    });
  }

  findById(companyId: string, id: string): Promise<ActivationRequest | undefined> {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.activationRequests.findFirst({ where: eq(activationRequests.id, id) }),
    );
  }

  /** The most recent request for an email in this company (for cooldown checks). */
  findLatestForEmail(companyId: string, email: string): Promise<ActivationRequest | undefined> {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.activationRequests.findFirst({
        where: and(
          eq(activationRequests.companyId, companyId),
          eq(activationRequests.email, email),
        ),
        orderBy: desc(activationRequests.createdAt),
      }),
    );
  }

  create(companyId: string, values: NewActivationRequest): Promise<ActivationRequest> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx.insert(activationRequests).values(values).returning();
      return row;
    });
  }

  update(
    companyId: string,
    id: string,
    values: Partial<NewActivationRequest>,
  ): Promise<ActivationRequest> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx
        .update(activationRequests)
        .set(values)
        .where(eq(activationRequests.id, id))
        .returning();
      return row;
    });
  }

  /** The user ids of every active owner/HR in the company (approval notifees). */
  approverUserIds(companyId: string): Promise<string[]> {
    const approverRoles: MembershipRole[] = ['owner', 'hr'];
    return this.db.withTenant(companyId, async (tx) => {
      const rows = await tx.query.memberships.findMany({
        where: and(eq(memberships.companyId, companyId), eq(memberships.status, 'active')),
        columns: { userId: true, role: true },
      });
      return rows.filter((r) => approverRoles.includes(r.role)).map((r) => r.userId);
    });
  }

  // ── privileged provisioning (global tables) ───────────────────────────────
  /** Find a global user by email (privileged — users is not tenant-scoped). */
  findUserByEmail(email: string) {
    return this.db.db.query.users.findFirst({ where: eq(users.email, email) });
  }

  /**
   * Create (or reuse) the global user + an ACTIVE membership for the company at
   * approval time, and link the employee row to it. Returns the membership id.
   */
  async provisionActiveMembership(input: {
    companyId: string;
    employeeId: string | null;
    email: string;
    name: string | null;
    supabaseUid: string;
    role: MembershipRole;
  }): Promise<{ userId: string; membershipId: string }> {
    return this.db.db.transaction(async (tx) => {
      const existing = await tx.query.users.findFirst({ where: eq(users.email, input.email) });
      const userId =
        existing?.id ??
        (
          await tx
            .insert(users)
            .values({ email: input.email, name: input.name, supabaseUid: input.supabaseUid })
            .returning()
        )[0].id;

      const [membership] = await tx
        .insert(memberships)
        .values({
          userId,
          companyId: input.companyId,
          role: input.role,
          scopeType: 'company',
          scopeIds: [],
          status: 'active',
        })
        .onConflictDoUpdate({
          target: [memberships.userId, memberships.companyId],
          set: { role: input.role, status: 'active' },
        })
        .returning();

      if (input.employeeId) {
        await tx.update(employees).set({ userId }).where(eq(employees.id, input.employeeId));
      }
      return { userId, membershipId: membership.id };
    });
  }
}
