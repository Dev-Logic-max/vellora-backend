import { Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';

import { DatabaseService } from '../database/database.service';
import { employees, users } from '../database/schema';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import type { UpdateMyProfileDto } from './dto/me-profile.dto';

/**
 * Self-service profile for the signed-in user ("My Account"). Reads the global
 * `users` identity (privileged — not tenant-scoped) plus, when the user is also
 * an employee of their active company, the richer personal fields from that
 * employee row (read/written under RLS via `withTenant`). A user can only ever
 * touch their OWN record here, so there is no role gate.
 */
@Injectable()
export class MeProfileService {
  constructor(private readonly db: DatabaseService) {}

  /** The user's active company (header-selected or first membership), or null. */
  private activeCompanyId(user: AuthenticatedUser): string | null {
    return user.companyId ?? user.memberships[0]?.companyId ?? null;
  }

  async get(user: AuthenticatedUser) {
    const [account] = await this.db.db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
        locale: users.locale,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, user.userId))
      .limit(1);

    const companyId = this.activeCompanyId(user);
    const employee = companyId ? await this.findEmployee(companyId, user.userId) : null;

    return {
      account: account ?? null,
      employee,
      role: user.role ?? null,
      platformRole: user.platformRole ?? null,
      companyId,
    };
  }

  /** The user's own employee row in `companyId` (RLS-scoped), or null. */
  private findEmployee(companyId: string, userId: string) {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.employees.findFirst({
        where: and(eq(employees.userId, userId), isNull(employees.deletedAt)),
      }),
    );
  }

  async update(user: AuthenticatedUser, dto: UpdateMyProfileDto) {
    // ── account (global users row) — name / avatar / locale ──────────────────
    const accountPatch: Partial<typeof users.$inferInsert> = {};
    if (dto.name !== undefined) accountPatch.name = dto.name;
    if (dto.avatarUrl !== undefined) accountPatch.avatarUrl = dto.avatarUrl;
    if (dto.locale !== undefined) accountPatch.locale = dto.locale;
    if (Object.keys(accountPatch).length) {
      await this.db.db.update(users).set(accountPatch).where(eq(users.id, user.userId));
    }

    // ── personal fields on the linked employee row (RLS-scoped) ──────────────
    const companyId = this.activeCompanyId(user);
    if (companyId) {
      const employee = await this.findEmployee(companyId, user.userId);
      if (employee) {
        const empPatch: Partial<typeof employees.$inferInsert> = {};
        const fields = [
          'phone',
          'nationality',
          'dateOfBirth',
          'gender',
          'maritalStatus',
          'country',
          'state',
          'city',
          'postalCode',
          'address',
        ] as const;
        for (const f of fields) {
          if (dto[f] !== undefined) empPatch[f] = dto[f] as never;
        }
        // The user's display name also mirrors onto the employee first/last name.
        if (dto.firstName !== undefined) empPatch.firstName = dto.firstName;
        if (dto.lastName !== undefined) empPatch.lastName = dto.lastName;
        if (dto.avatarUrl !== undefined) empPatch.avatarUrl = dto.avatarUrl;
        if (Object.keys(empPatch).length) {
          await this.db.withTenant(companyId, (tx) =>
            tx.update(employees).set(empPatch).where(eq(employees.id, employee.id)),
          );
        }
      }
    }

    return this.get(user);
  }
}
