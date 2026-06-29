import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import { MEMBERSHIP_ROLES, type MembershipRole } from '../database/schema/enums';
import { moduleVisibility, permissions } from '../database/schema';
import { ACCESS, defaultAllows, MODULES } from './permission-defaults';

export interface MatrixCell {
  role: MembershipRole;
  resource: string;
  action: string;
  allowed: boolean;
  source: 'default' | 'override';
}

export interface PermissionInput {
  role: MembershipRole;
  resource: string;
  action?: string;
  allowed: boolean;
}

@Injectable()
export class PermissionsService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly auditService: AuditService,
  ) {}

  /** Effective check: override row wins, else the role default. */
  async can(
    companyId: string,
    role: MembershipRole,
    resource: string,
    action: string = ACCESS,
  ): Promise<boolean> {
    const override = await this.databaseService.withTenant(companyId, (tx) =>
      tx.query.permissions.findFirst({
        where: and(
          eq(permissions.role, role),
          eq(permissions.resource, resource),
          eq(permissions.action, action),
        ),
      }),
    );
    return override ? override.allowed : defaultAllows(role, resource);
  }

  /**
   * Module keys the given role may access (override ∨ default) for one company.
   * Powers the sidebar visibility gate — readable by any authenticated member
   * (no settings permission required, it only reveals the caller's own role).
   */
  async allowedModulesFor(companyId: string, role: MembershipRole): Promise<string[]> {
    const overrides = await this.databaseService.withTenant(companyId, (tx) =>
      tx.query.permissions.findMany({ where: eq(permissions.role, role) }),
    );
    const overrideMap = new Map(overrides.map((o) => [`${o.resource}:${o.action}`, o.allowed]));
    return MODULES.filter((moduleKey) => {
      const key = `${moduleKey}:${ACCESS}`;
      return overrideMap.has(key) ? overrideMap.get(key)! : defaultAllows(role, moduleKey);
    });
  }

  /** The full roles × modules matrix, merging defaults with stored overrides. */
  async getMatrix(companyId: string): Promise<MatrixCell[]> {
    const overrides = await this.databaseService.withTenant(companyId, (tx) =>
      tx.query.permissions.findMany(),
    );
    const overrideMap = new Map(
      overrides.map((o) => [`${o.role}:${o.resource}:${o.action}`, o.allowed]),
    );

    const cells: MatrixCell[] = [];
    for (const role of MEMBERSHIP_ROLES) {
      for (const moduleKey of MODULES) {
        const key = `${role}:${moduleKey}:${ACCESS}`;
        const hasOverride = overrideMap.has(key);
        cells.push({
          role,
          resource: moduleKey,
          action: ACCESS,
          allowed: hasOverride ? overrideMap.get(key)! : defaultAllows(role, moduleKey),
          source: hasOverride ? 'override' : 'default',
        });
      }
    }
    return cells;
  }

  /** Batch upsert overrides; audited. */
  async setOverrides(
    companyId: string,
    actorUserId: string | undefined,
    entries: PermissionInput[],
  ): Promise<MatrixCell[]> {
    await this.databaseService.withTenant(companyId, async (tx) => {
      for (const entry of entries) {
        const action = entry.action ?? ACCESS;
        await tx
          .insert(permissions)
          .values({
            companyId,
            role: entry.role,
            resource: entry.resource,
            action,
            allowed: entry.allowed,
          })
          .onConflictDoUpdate({
            target: [
              permissions.companyId,
              permissions.role,
              permissions.resource,
              permissions.action,
            ],
            set: { allowed: entry.allowed },
          });
      }
    });

    await this.auditService.log({
      companyId,
      actorUserId,
      action: 'permissions.update',
      resource: 'permissions',
      meta: { count: entries.length, entries },
    });

    return this.getMatrix(companyId);
  }

  async getModuleVisibility(companyId: string) {
    return this.databaseService.withTenant(companyId, (tx) => tx.query.moduleVisibility.findMany());
  }

  async setModuleVisibility(
    companyId: string,
    actorUserId: string | undefined,
    entries: { role: MembershipRole; moduleKey: string; visible: boolean }[],
  ) {
    await this.databaseService.withTenant(companyId, async (tx) => {
      for (const entry of entries) {
        await tx
          .insert(moduleVisibility)
          .values({
            companyId,
            role: entry.role,
            moduleKey: entry.moduleKey,
            visible: entry.visible,
          })
          .onConflictDoUpdate({
            target: [moduleVisibility.companyId, moduleVisibility.role, moduleVisibility.moduleKey],
            set: { visible: entry.visible },
          });
      }
    });
    await this.auditService.log({
      companyId,
      actorUserId,
      action: 'module_visibility.update',
      resource: 'module_visibility',
      meta: { count: entries.length },
    });
    return this.getModuleVisibility(companyId);
  }
}
