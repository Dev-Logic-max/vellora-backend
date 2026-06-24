import { Injectable, NotFoundException } from '@nestjs/common';
import { PermissionsService } from '../permissions/permissions.service';
import { MODULES } from '../permissions/permission-defaults';
import { AdminRepository } from './admin.repository';
import type {
  AdminPermissionsDto,
  AssignPlanDto,
  FlagDto,
  OverrideDto,
  PlanUpsertDto,
  SetStatusDto,
} from './dto/admin.dto';

/**
 * Platform-console orchestration (P9-E). Cross-tenant by design; EVERY mutating
 * action writes a `platform_audit_log` entry with the acting operator. Reads run
 * on the privileged connection (no tenant RLS) — the PlatformGuard is the gate.
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly repo: AdminRepository,
    private readonly permissions: PermissionsService,
  ) {}

  // ── tenants ─────────────────────────────────────────────────────────────────
  async listTenants() {
    const companies = await this.repo.listCompanies();
    return Promise.all(
      companies.map(async (c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        status: c.status,
        createdAt: c.createdAt,
        employees: await this.repo.countEmployees(c.id),
        subscription: await this.repo.getSubscription(c.id),
      })),
    );
  }

  async getTenant(id: string) {
    const company = await this.repo.getCompany(id);
    if (!company) throw new NotFoundException('Tenant not found.');
    return {
      ...company,
      employees: await this.repo.countEmployees(id),
      subscription: await this.repo.getSubscription(id),
      override: await this.repo.getOverride(id),
    };
  }

  async setStatus(actorUserId: string, id: string, dto: SetStatusDto) {
    await this.getTenant(id);
    await this.repo.setCompanyStatus(id, dto.status);
    await this.repo.writeAudit({
      actorUserId,
      action: 'tenant.status',
      targetCompanyId: id,
      meta: { status: dto.status },
    });
    return { ok: true };
  }

  // ── plans & entitlements ─────────────────────────────────────────────────────
  listPlans() {
    return this.repo.listPlans();
  }

  /** Map the editable DTO → plan column patch (limits→limitsJson, etc.). */
  private toPlanPatch(dto: PlanUpsertDto) {
    return {
      ...(dto.key !== undefined ? { key: dto.key } : {}),
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.tier !== undefined ? { tier: dto.tier } : {}),
      ...(dto.priceMonth !== undefined ? { priceMonth: dto.priceMonth } : {}),
      ...(dto.priceYear !== undefined ? { priceYear: dto.priceYear } : {}),
      ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
      ...(dto.tagline !== undefined ? { tagline: dto.tagline } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.highlights !== undefined ? { highlights: dto.highlights } : {}),
      ...(dto.popular !== undefined ? { popular: dto.popular } : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      ...(dto.limits !== undefined ? { limitsJson: dto.limits } : {}),
      ...(dto.entitlements !== undefined ? { entitlementsJson: dto.entitlements } : {}),
    };
  }

  async updatePlan(actorUserId: string, id: string, dto: PlanUpsertDto) {
    const existing = await this.repo.getPlan(id);
    if (!existing) throw new NotFoundException('Plan not found.');
    const row = await this.repo.updatePlan(id, this.toPlanPatch(dto));
    await this.repo.writeAudit({
      actorUserId,
      action: 'plan.update',
      meta: { id, name: row.name },
    });
    return row;
  }

  async createPlan(actorUserId: string, dto: PlanUpsertDto) {
    if (!dto.key || !dto.name) {
      throw new NotFoundException('A new plan needs a key and name.');
    }
    const row = await this.repo.createPlan({
      key: dto.key,
      name: dto.name,
      ...this.toPlanPatch(dto),
    });
    await this.repo.writeAudit({ actorUserId, action: 'plan.create', meta: { key: dto.key } });
    return row;
  }

  async assignPlan(actorUserId: string, companyId: string, dto: AssignPlanDto) {
    await this.getTenant(companyId);
    await this.repo.assignPlan(companyId, dto.planId);
    await this.repo.writeAudit({
      actorUserId,
      action: 'tenant.assign_plan',
      targetCompanyId: companyId,
      meta: { planId: dto.planId },
    });
    return { ok: true };
  }

  async setOverride(actorUserId: string, companyId: string, dto: OverrideDto) {
    await this.getTenant(companyId);
    await this.repo.upsertOverride(companyId, dto.entitlements, dto.limits, actorUserId);
    await this.repo.writeAudit({
      actorUserId,
      action: 'tenant.entitlement_override',
      targetCompanyId: companyId,
      meta: { entitlements: dto.entitlements, limits: dto.limits },
    });
    return { ok: true };
  }

  // ── feature flags ─────────────────────────────────────────────────────────────
  listFlags() {
    return this.repo.listFlags();
  }

  async setFlag(actorUserId: string, dto: FlagDto) {
    const flag = await this.repo.upsertFlag(dto.key, dto.enabled, actorUserId);
    await this.repo.writeAudit({
      actorUserId,
      action: 'flag.set',
      meta: { key: dto.key, enabled: dto.enabled },
    });
    return flag;
  }

  // ── audit ──────────────────────────────────────────────────────────────────
  listAudit() {
    return this.repo.listAudit();
  }

  // ── impersonation (audited start/stop) ──────────────────────────────────────
  async startImpersonation(actorUserId: string, companyId: string) {
    const company = await this.repo.getCompany(companyId);
    if (!company) throw new NotFoundException('Tenant not found.');
    await this.repo.writeAudit({
      actorUserId,
      action: 'impersonate.start',
      targetCompanyId: companyId,
    });
    // The frontend stores this + sends `x-company-id` for read-only tenant views.
    return { companyId, companyName: company.name };
  }

  async stopImpersonation(actorUserId: string, companyId: string) {
    await this.repo.writeAudit({
      actorUserId,
      action: 'impersonate.stop',
      targetCompanyId: companyId,
    });
    return { ok: true };
  }

  // ── cross-tenant permissions (super-admin matrix editor) ────────────────────
  /** The configurable module catalogue (matrix rows). Platform-level constant. */
  permissionModules() {
    return { modules: MODULES };
  }

  /** Any company's role×module matrix — for the platform Permissions company picker. */
  async getTenantPermissions(companyId: string) {
    await this.getTenant(companyId); // 404s for unknown tenants
    return this.permissions.getMatrix(companyId);
  }

  /** Edit any company's matrix as a platform operator (tenant-scoped under the hood + audited). */
  async setTenantPermissions(actorUserId: string, companyId: string, dto: AdminPermissionsDto) {
    await this.getTenant(companyId);
    const result = await this.permissions.setOverrides(companyId, actorUserId, dto.entries);
    await this.repo.writeAudit({
      actorUserId,
      action: 'tenant.permissions',
      targetCompanyId: companyId,
      meta: { count: dto.entries.length },
    });
    return result;
  }
}
