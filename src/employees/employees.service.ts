import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration';
import { BillingService } from '../billing/billing.service';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import type { Employee, NewEmployee } from '../database/schema';
import { parseEmployeeCsv, toEmployeeCsv } from './employee-csv';
import { ActivationRequestsService } from './activation-requests.service';
import { EmployeesRepository, type EmployeeFilters } from './employees.repository';
import type {
  CreateBankAccountDto,
  CreateContractDto,
  CreateEmployeeDto,
  CreateMedicalDto,
  CreateQualificationDto,
  InviteEmployeeDto,
  ListEmployeesDto,
  UpdateEmployeeDto,
  UpdatePreferencesDto,
  UpsertStoreLinkDto,
} from './dto/employee.dto';

/**
 * Tenant-scoped employee management. On top of RLS, reads/writes are narrowed by
 * the caller's scope: owner/HR full; area/store managers limited to their stores
 * (an employee is in scope when its primary store is). Employees only ever touch
 * their own profile/preferences — enforced one level up by the controller guards.
 */
@Injectable()
export class EmployeesService {
  private readonly logger = new Logger(EmployeesService.name);

  constructor(
    private readonly repo: EmployeesRepository,
    private readonly tenant: TenantContextService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly billing: BillingService,
    private readonly activation: ActivationRequestsService,
  ) {}

  /** Store ids the caller may see, or null for "all company stores". */
  private scopedStoreIds(): string[] | null {
    const user = this.tenant.get()?.user;
    if (!user) return [];
    if (user.role === 'area_manager' || user.role === 'store_manager') {
      return user.scopeIds ?? [];
    }
    return null; // owner / hr → all
  }

  private assertStoreInScope(storeId: string | null): void {
    const ids = this.scopedStoreIds();
    if (ids && (!storeId || !ids.includes(storeId))) {
      throw new ForbiddenException('That employee is outside your store scope.');
    }
  }

  async list(companyId: string, dto: ListEmployeesDto) {
    const filters: EmployeeFilters = {
      page: dto.page,
      pageSize: dto.pageSize,
      storeId: dto.storeId,
      role: dto.role,
      status: dto.status,
      q: dto.q,
    };
    const scope = this.scopedStoreIds();
    if (scope && scope.length === 0) {
      return { data: [], total: 0, page: dto.page, pageSize: dto.pageSize };
    }
    const { rows, total } = await this.repo.list(companyId, filters, scope);
    return { data: rows, total, page: dto.page, pageSize: dto.pageSize };
  }

  async get(companyId: string, id: string) {
    const employee = await this.repo.findDetail(companyId, id);
    if (!employee) throw new NotFoundException('Employee not found.');
    this.assertStoreInScope(employee.primaryStoreId);
    return employee;
  }

  /** Public profile read: detail + the user's company membership role. */
  async getDetail(companyId: string, id: string) {
    const employee = await this.get(companyId, id);
    const membershipRole = await this.repo.membershipRoleForUser(companyId, employee.userId);
    return { ...employee, membershipRole };
  }

  /** Users above Employee in this company — the supervisor picker source. */
  listSupervisors(companyId: string) {
    return this.repo.listSupervisorCandidates(companyId);
  }

  // ── activation requests (delegate to the workflow service) ─────────────────
  listActivationRequests(companyId: string, status?: 'pending' | 'approved' | 'rejected') {
    return this.activation.list(companyId, status);
  }

  approveActivation(companyId: string, requestId: string, redirectTo?: string) {
    return this.activation.approve(companyId, requestId, redirectTo);
  }

  rejectActivation(companyId: string, requestId: string, reason?: string) {
    return this.activation.reject(companyId, requestId, reason);
  }

  /** Generates the next `<STORE>-EMP-NNN` code for the company. */
  private async nextCode(companyId: string, primaryStoreId?: string): Promise<string> {
    let prefix = 'EMP';
    if (primaryStoreId) {
      const code = await this.repo.storeCode(companyId, primaryStoreId);
      const cleaned = code
        ?.replace(/[^A-Za-z0-9]/g, '')
        .toUpperCase()
        .slice(0, 6);
      if (cleaned) prefix = `${cleaned}-EMP`;
    }
    const seq = (await this.repo.maxCodeSeq(companyId, prefix)) + 1;
    return `${prefix}-${String(seq).padStart(3, '0')}`;
  }

  async create(companyId: string, dto: CreateEmployeeDto): Promise<Employee> {
    await this.billing.assertWithinLimit(companyId, 'employees');
    if (dto.primaryStoreId) this.assertStoreInScope(dto.primaryStoreId);
    // Pull the platform-login fields out — they don't belong on the employee row.
    const { secondaryStores, uniqueCode, companyEmail, membershipRole, accountEmail, ...rest } =
      dto;
    const code = uniqueCode ?? (await this.nextCode(companyId, dto.primaryStoreId));
    // Keep `jobTitle` and the legacy `role` (job) column in sync.
    const jobTitle = rest.jobTitle ?? rest.role;
    const values: NewEmployee = {
      companyId,
      uniqueCode: code,
      ...rest,
      ...(jobTitle ? { jobTitle, role: jobTitle } : {}),
      ...(companyEmail ? { companyEmail } : {}),
    };
    const links = (secondaryStores ?? []).map((s) => ({
      storeId: s.storeId,
      relation: s.relation,
    }));
    const employee = await this.repo.create(companyId, values, links);

    // When a platform role was chosen, raise a PENDING activation request (the
    // login is provisioned + the membership activated only on HR/admin approval).
    if (membershipRole) {
      const loginEmail = accountEmail || dto.email;
      if (!loginEmail) {
        throw new BadRequestException(
          'An email is required to create a login for the selected role.',
        );
      }
      await this.activation.raise({
        companyId,
        employeeId: employee.id,
        email: loginEmail,
        role: membershipRole,
        source: 'created',
      });
    }
    return employee;
  }

  async update(companyId: string, id: string, dto: UpdateEmployeeDto): Promise<Employee> {
    await this.get(companyId, id);
    if (dto.primaryStoreId) this.assertStoreInScope(dto.primaryStoreId);
    // Secondary store links are managed via the dedicated /stores endpoints.
    const { secondaryStores, ...rest } = dto;
    void secondaryStores;
    return this.repo.update(companyId, id, rest);
  }

  async archive(companyId: string, id: string): Promise<Employee> {
    await this.get(companyId, id);
    return this.repo.update(companyId, id, { status: 'archived' });
  }

  /** Permanently delete an employee + their sub-rows (irreversible). */
  async remove(companyId: string, id: string): Promise<{ deleted: true }> {
    await this.get(companyId, id);
    await this.repo.remove(companyId, id);
    return { deleted: true };
  }

  // ── invite ────────────────────────────────────────────────────────────────
  async invite(companyId: string, id: string, dto: InviteEmployeeDto) {
    const employee = await this.get(companyId, id);
    const email = dto.email ?? employee.email;
    if (!email) throw new BadRequestException('This employee has no email to invite.');

    const supabaseUid = await this.sendSupabaseInvite(email, dto.redirectTo);
    const updated = await this.repo.update(companyId, id, {
      email,
      status: 'invited',
    });
    // TODO(Phase 6): enqueue a branded set-password email via BullMQ in addition
    // to Supabase's default invite mail.
    return { employee: updated, invited: true, authLinked: Boolean(supabaseUid) };
  }

  /**
   * Creates a Supabase Auth invite (sends the set-password email). Soft-fails to
   * a logged warning when the service-role key is not configured so the flow
   * still marks the employee invited in dev.
   */
  private async sendSupabaseInvite(email: string, redirectTo?: string): Promise<string | null> {
    const url = this.config.get('supabase.url', { infer: true });
    const serviceKey = this.config.get('supabase.serviceRoleKey', { infer: true });
    if (!url || !serviceKey) {
      this.logger.warn('Supabase service role key not set — skipping real invite email.');
      return null;
    }
    try {
      const res = await fetch(`${url}/auth/v1/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ email, ...(redirectTo ? { redirect_to: redirectTo } : {}) }),
      });
      if (!res.ok) {
        this.logger.warn(`Supabase invite failed (${res.status}) for ${email}.`);
        return null;
      }
      const body = (await res.json()) as { id?: string };
      return body.id ?? null;
    } catch (err) {
      this.logger.warn(`Supabase invite error: ${(err as Error).message}`);
      return null;
    }
  }

  // ── import / export ─────────────────────────────────────────────────────────
  async importCsv(companyId: string, csv: string) {
    const rows = parseEmployeeCsv(csv);
    if (rows.length === 0) {
      throw new BadRequestException('No valid rows found (need firstName + lastName).');
    }
    // Enforce the plan cap for the whole batch up front (one check, not per-row).
    await this.billing.assertWithinLimit(companyId, 'employees', rows.length);
    let created = 0;
    const errors: string[] = [];
    for (const row of rows) {
      try {
        const code = row.uniqueCode ?? (await this.nextCode(companyId));
        await this.repo.create(
          companyId,
          {
            companyId,
            uniqueCode: code,
            firstName: row.firstName,
            lastName: row.lastName,
            email: row.email,
            phone: row.phone,
            role: row.role,
            department: row.department,
          },
          [],
        );
        created += 1;
      } catch (err) {
        errors.push(`${row.firstName} ${row.lastName}: ${(err as Error).message}`);
      }
    }
    return { created, skipped: errors.length, total: rows.length, errors };
  }

  async exportCsv(companyId: string): Promise<string> {
    const rows = await this.repo.exportAll(companyId, this.scopedStoreIds());
    return toEmployeeCsv(rows);
  }

  // ── store links ─────────────────────────────────────────────────────────────
  async listStoreLinks(companyId: string, id: string) {
    await this.get(companyId, id);
    return this.repo.listLinks(companyId, id);
  }

  async addStoreLink(companyId: string, id: string, dto: UpsertStoreLinkDto) {
    await this.get(companyId, id);
    return this.repo.addLink(companyId, id, dto);
  }

  async removeStoreLink(companyId: string, id: string, storeId: string) {
    await this.get(companyId, id);
    await this.repo.removeLink(companyId, id, storeId);
    return { removed: true };
  }

  // ── bank accounts ───────────────────────────────────────────────────────
  async listBankAccounts(companyId: string, id: string) {
    await this.get(companyId, id);
    return this.repo.listBankAccounts(companyId, id);
  }

  async addBankAccount(companyId: string, id: string, dto: CreateBankAccountDto) {
    await this.get(companyId, id);
    return this.repo.addBankAccount(companyId, { companyId, employeeId: id, ...dto });
  }

  async removeBankAccount(companyId: string, id: string, accountId: string) {
    await this.get(companyId, id);
    await this.repo.removeBankAccount(companyId, id, accountId);
    return { removed: true };
  }

  // ── contracts (managed lifecycle) ─────────────────────────────────────────
  async listContracts(companyId: string, id: string) {
    await this.get(companyId, id);
    return this.repo.listContracts(companyId, id);
  }

  async addContract(companyId: string, id: string, dto: CreateContractDto) {
    await this.get(companyId, id);
    return this.repo.addContract(companyId, {
      companyId,
      employeeId: id,
      title: dto.title,
      type: dto.type,
      startDate: dto.startDate,
      endDate: dto.endDate,
      hoursWeek: dto.hoursWeek,
      salary: dto.salary !== undefined ? String(dto.salary) : undefined,
      currency: dto.currency,
      docId: dto.docId,
    });
  }

  private async getContractOrThrow(companyId: string, id: string, contractId: string) {
    await this.get(companyId, id);
    const contract = await this.repo.findContract(companyId, id, contractId);
    if (!contract) throw new NotFoundException('Contract not found.');
    return contract;
  }

  /** Extend (or re-open) a contract by moving its end date. Only active ones. */
  async extendContract(companyId: string, id: string, contractId: string, endDate: string | null) {
    const contract = await this.getContractOrThrow(companyId, id, contractId);
    if (contract.status !== 'active') {
      throw new BadRequestException('Only an active contract can be extended.');
    }
    return this.repo.updateContract(companyId, contractId, { endDate });
  }

  /** Cancel a contract — kept (cancelled) until permanently deleted. */
  async cancelContract(companyId: string, id: string, contractId: string, reason?: string) {
    const contract = await this.getContractOrThrow(companyId, id, contractId);
    if (contract.status === 'cancelled') {
      throw new BadRequestException('This contract is already cancelled.');
    }
    const actor = this.tenant.get()?.user?.userId ?? null;
    return this.repo.updateContract(companyId, contractId, {
      status: 'cancelled',
      cancelReason: reason ?? null,
      cancelledAt: new Date(),
      cancelledBy: actor,
    });
  }

  /** Permanently delete a contract — only allowed once it has been cancelled. */
  async deleteContract(companyId: string, id: string, contractId: string) {
    const contract = await this.getContractOrThrow(companyId, id, contractId);
    if (contract.status !== 'cancelled') {
      throw new BadRequestException('Cancel the contract before deleting it.');
    }
    await this.repo.softDeleteContract(companyId, contractId);
    return { deleted: true };
  }

  // ── qualifications (paid) ────────────────────────────────────────────────
  async listQualifications(companyId: string, id: string) {
    await this.get(companyId, id);
    return this.repo.listQualifications(companyId, id);
  }

  async addQualification(companyId: string, id: string, dto: CreateQualificationDto) {
    await this.get(companyId, id);
    return this.repo.addQualification(companyId, { companyId, employeeId: id, ...dto });
  }

  // ── medicals (paid) ──────────────────────────────────────────────────────
  async listMedicals(companyId: string, id: string) {
    await this.get(companyId, id);
    return this.repo.listMedicals(companyId, id);
  }

  async addMedical(companyId: string, id: string, dto: CreateMedicalDto) {
    await this.get(companyId, id);
    return this.repo.addMedical(companyId, { companyId, employeeId: id, ...dto });
  }

  // ── preferences ─────────────────────────────────────────────────────────────
  async getPreferences(companyId: string, id: string) {
    await this.get(companyId, id);
    const prefs = await this.repo.getPreferences(companyId, id);
    return prefs ?? { employeeId: id, availability: {}, notifPrefs: {}, uiPrefs: {} };
  }

  async updatePreferences(companyId: string, id: string, dto: UpdatePreferencesDto) {
    await this.get(companyId, id);
    return this.repo.upsertPreferences(companyId, id, dto);
  }
}
