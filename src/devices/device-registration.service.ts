import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { companies, type CompanySettings, type DeviceRegistration } from '../database/schema';
import {
  DeviceRegistrationRepository,
  type RegistrationWithEmployee,
} from './device-registration.repository';
import type {
  AdminRegisterDto,
  ListRegistrationsDto,
  RegisterMyDeviceDto,
} from './dto/device-registration.dto';

/**
 * One-time device registration that gates attendance (point 21). An employee
 * must bind the device they clock in from; the binding is unique (one ACTIVE
 * per employee) so credentials alone can't let someone punch for another.
 * Fingerprint is an OPTIONAL secondary check, only enforced when the company
 * turns it on — registration (a server-issued device token) is the primary gate.
 */
@Injectable()
export class DeviceRegistrationService {
  constructor(
    private readonly repo: DeviceRegistrationRepository,
    private readonly tenant: TenantContextService,
    private readonly db: DatabaseService,
  ) {}

  private currentUserId(): string | undefined {
    return this.tenant.get()?.user.userId;
  }

  private scopedStoreIds(): string[] | null {
    const user = this.tenant.get()?.user;
    if (!user) return [];
    if (user.role === 'area_manager' || user.role === 'store_manager') return user.scopeIds ?? [];
    return null;
  }

  private assertStoreInScope(storeId: string | null): void {
    const ids = this.scopedStoreIds();
    if (ids && (!storeId || !ids.includes(storeId))) {
      throw new ForbiddenException('That employee is outside your store scope.');
    }
  }

  /** Reads the company's attendance settings (fingerprint enforcement, etc.). */
  async getCompanySettings(companyId: string): Promise<CompanySettings> {
    const [row] = await this.db.db
      .select({ settings: companies.settings })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);
    return row?.settings ?? {};
  }

  // ── employee self-service ──────────────────────────────────────────────────
  /** The signed-in employee's own registration status (drives the My-Profile UI). */
  async getMyStatus(companyId: string): Promise<MyDeviceStatus> {
    const userId = this.currentUserId();
    const employee = userId ? await this.repo.employeeByUser(companyId, userId) : null;
    const settings = await this.getCompanySettings(companyId);
    if (!employee) {
      return {
        isEmployee: false,
        registered: false,
        requireFingerprint: Boolean(settings.requireDeviceFingerprint),
        registration: null,
      };
    }
    const active = await this.repo.findActiveForEmployee(companyId, employee.id);
    return {
      isEmployee: true,
      employeeId: employee.id,
      registered: Boolean(active),
      requireFingerprint: Boolean(settings.requireDeviceFingerprint),
      registration: active ? publicView(active) : null,
    };
  }

  /** The signed-in employee binds the current device (one-time). */
  async registerMine(companyId: string, dto: RegisterMyDeviceDto): Promise<MyDeviceStatus> {
    const userId = this.currentUserId();
    const employee = userId ? await this.repo.employeeByUser(companyId, userId) : null;
    if (!employee) {
      throw new ForbiddenException('Only employees can register a personal device.');
    }
    const existing = await this.repo.findActiveForEmployee(companyId, employee.id);
    if (existing) {
      throw new BadRequestException(
        'This account already has a registered device. Ask HR to reset it to register a new one.',
      );
    }
    const settings = await this.getCompanySettings(companyId);
    if (settings.requireDeviceFingerprint && !dto.fingerprint) {
      throw new BadRequestException(
        'A device fingerprint is required to register. Please retry from a supported browser.',
      );
    }
    const deviceToken = dto.deviceToken?.trim() || newToken();
    const created = await this.repo.create(companyId, {
      companyId,
      employeeId: employee.id,
      deviceToken,
      fingerprint: dto.fingerprint ?? null,
      label: dto.label ?? defaultLabel(dto.platform),
      platform: dto.platform ?? null,
      userAgent: dto.userAgent ?? null,
      status: 'active',
      lastSeenAt: new Date(),
    });
    await this.repo.addLog(companyId, {
      companyId,
      employeeId: employee.id,
      registrationId: created.id,
      action: 'registered',
      actorUserId: userId,
      deviceLabel: created.label,
      note: 'Self-registered from device.',
    });
    return {
      isEmployee: true,
      employeeId: employee.id,
      registered: true,
      requireFingerprint: Boolean(settings.requireDeviceFingerprint),
      registration: publicView(created),
      deviceToken, // returned once so the device can persist it locally
    };
  }

  // ── manager management ─────────────────────────────────────────────────────
  async list(companyId: string, dto: ListRegistrationsDto): Promise<RegistrationWithEmployee[]> {
    const scope = this.scopedStoreIds();
    if (scope && scope.length === 0) return [];
    const rows = await this.repo.list(
      companyId,
      { employeeId: dto.employeeId, status: dto.status },
      scope,
    );
    // Attach each employee's membership role (the staff "user role") in one lookup.
    const userIds = rows.map((r) => r.employee?.userId).filter((id): id is string => Boolean(id));
    const roles = await this.repo.membershipRolesByUser(companyId, userIds);
    for (const r of rows) {
      if (r.employee?.userId) r.employee.membershipRole = roles.get(r.employee.userId) ?? null;
    }
    return rows;
  }

  async listHistory(companyId: string, employeeId: string) {
    const employee = await this.repo.employeeById(companyId, employeeId);
    if (!employee) throw new NotFoundException('Employee not found.');
    this.assertStoreInScope(employee.primaryStoreId);
    return this.repo.listLogs(companyId, employeeId);
  }

  /** HR/admin register a device for an employee (e.g. in person). */
  async adminRegister(companyId: string, dto: AdminRegisterDto): Promise<DeviceRegistration> {
    const employee = await this.repo.employeeById(companyId, dto.employeeId);
    if (!employee) throw new NotFoundException('Employee not found.');
    this.assertStoreInScope(employee.primaryStoreId);
    const existing = await this.repo.findActiveForEmployee(companyId, dto.employeeId);
    if (existing) {
      throw new BadRequestException('This employee already has a registered device.');
    }
    const created = await this.repo.create(companyId, {
      companyId,
      employeeId: dto.employeeId,
      deviceToken: newToken(),
      label: dto.label ?? 'Registered by admin',
      platform: dto.platform ?? null,
      status: 'active',
    });
    await this.repo.addLog(companyId, {
      companyId,
      employeeId: dto.employeeId,
      registrationId: created.id,
      action: 'registered',
      actorUserId: this.currentUserId(),
      deviceLabel: created.label,
      note: 'Registered by manager.',
    });
    return created;
  }

  /** Remove the binding so the employee can register a new device. */
  async revoke(companyId: string, id: string): Promise<DeviceRegistration> {
    const reg = await this.getRegistration(companyId, id);
    const updated = await this.repo.update(companyId, id, {
      status: 'revoked',
      revokedBy: this.currentUserId(),
      revokedAt: new Date(),
    });
    await this.repo.addLog(companyId, {
      companyId,
      employeeId: reg.employeeId,
      registrationId: reg.id,
      action: 'revoked',
      actorUserId: this.currentUserId(),
      deviceLabel: reg.label,
      note: 'Registration removed.',
    });
    return updated;
  }

  /** Freeze the device without removing it (employee can't clock in). */
  async disable(companyId: string, id: string): Promise<DeviceRegistration> {
    const reg = await this.getRegistration(companyId, id);
    if (reg.status !== 'active') {
      throw new BadRequestException('Only an active registration can be disabled.');
    }
    const updated = await this.repo.update(companyId, id, { status: 'disabled' });
    await this.repo.addLog(companyId, {
      companyId,
      employeeId: reg.employeeId,
      registrationId: reg.id,
      action: 'disabled',
      actorUserId: this.currentUserId(),
      deviceLabel: reg.label,
    });
    return updated;
  }

  /** Re-enable a disabled device (back to active). */
  async enable(companyId: string, id: string): Promise<DeviceRegistration> {
    const reg = await this.getRegistration(companyId, id);
    if (reg.status !== 'disabled') {
      throw new BadRequestException('Only a disabled registration can be re-enabled.');
    }
    // Guard the one-active-per-employee invariant.
    const active = await this.repo.findActiveForEmployee(companyId, reg.employeeId);
    if (active) {
      throw new BadRequestException(
        'This employee already has another active device. Revoke it first.',
      );
    }
    const updated = await this.repo.update(companyId, id, { status: 'active' });
    await this.repo.addLog(companyId, {
      companyId,
      employeeId: reg.employeeId,
      registrationId: reg.id,
      action: 'enabled',
      actorUserId: this.currentUserId(),
      deviceLabel: reg.label,
    });
    return updated;
  }

  // ── attendance gate (called by the kiosk-punch path) ───────────────────────
  /**
   * Throws unless the employee may clock in from this device: an ACTIVE
   * registration must exist, and — when the company enables it — the presented
   * fingerprint/token must match. Returns the matched registration id so the
   * caller can stamp `lastSeenAt`.
   */
  async assertCanClockIn(
    companyId: string,
    employeeId: string,
    presented: { deviceToken?: string; fingerprint?: string },
  ): Promise<string> {
    const active = await this.repo.findActiveForEmployee(companyId, employeeId);
    if (!active) {
      throw new ForbiddenException(
        'This device is not registered. Register it from My Profile before clocking in.',
      );
    }
    const settings = await this.getCompanySettings(companyId);
    // Primary check: the device token must match the active registration.
    if (presented.deviceToken && presented.deviceToken !== active.deviceToken) {
      throw new ForbiddenException('This is not the device registered to your account.');
    }
    // Secondary (optional) check: fingerprint, only when the company requires it.
    if (settings.requireDeviceFingerprint) {
      if (!presented.fingerprint || presented.fingerprint !== active.fingerprint) {
        throw new ForbiddenException(
          'Device verification failed. Clock in from your registered device.',
        );
      }
    }
    await this.repo.update(companyId, active.id, { lastSeenAt: new Date() });
    return active.id;
  }

  private async getRegistration(companyId: string, id: string): Promise<DeviceRegistration> {
    const reg = await this.repo.findById(companyId, id);
    if (!reg) throw new NotFoundException('Device registration not found.');
    this.assertStoreInScope(reg.employee?.primaryStoreId ?? null);
    return reg;
  }
}

export interface MyDeviceStatus {
  isEmployee: boolean;
  employeeId?: string;
  registered: boolean;
  requireFingerprint: boolean;
  registration: PublicRegistration | null;
  /** Only present immediately after registering (so the device can store it). */
  deviceToken?: string;
}

export interface PublicRegistration {
  id: string;
  label: string | null;
  platform: string | null;
  status: DeviceRegistration['status'];
  registeredAt: string;
  lastSeenAt: string | null;
}

function publicView(reg: DeviceRegistration): PublicRegistration {
  return {
    id: reg.id,
    label: reg.label,
    platform: reg.platform,
    status: reg.status,
    registeredAt: reg.registeredAt.toISOString(),
    lastSeenAt: reg.lastSeenAt ? reg.lastSeenAt.toISOString() : null,
  };
}

function newToken(): string {
  return `dev_${randomBytes(20).toString('hex')}`;
}

function defaultLabel(platform?: string): string {
  return platform ? `${platform} device` : 'My device';
}
