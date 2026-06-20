import { Injectable, NotFoundException } from '@nestjs/common';
import { AdminRepository } from './admin.repository';
import type { AssignPlanDto, FlagDto, OverrideDto, SetStatusDto } from './dto/admin.dto';

/**
 * Platform-console orchestration (P9-E). Cross-tenant by design; EVERY mutating
 * action writes a `platform_audit_log` entry with the acting operator. Reads run
 * on the privileged connection (no tenant RLS) — the PlatformGuard is the gate.
 */
@Injectable()
export class AdminService {
  constructor(private readonly repo: AdminRepository) {}

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
}
