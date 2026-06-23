import { randomBytes } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import type { Device, Terminal } from '../database/schema';
import { DevicesRepository } from './devices.repository';
import type { CreateTerminalDto, ListDevicesDto, RegisterDeviceDto } from './dto/device.dto';

/**
 * Tenant-scoped device + terminal management. Lightweight binding only — a soft
 * token + hint, never a hardware fingerprint (14-devices-terminals §3). On top
 * of RLS, area/store managers are limited to their own stores. The QR rotation
 * window is env-driven (`TERMINAL_QR_TTL_SECONDS`, default 180s).
 */
@Injectable()
export class DevicesService {
  /** Seconds a terminal QR stays valid before the secret rotates. */
  private readonly qrTtlSeconds: number;

  constructor(
    private readonly repo: DevicesRepository,
    private readonly tenant: TenantContextService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.qrTtlSeconds = config.get('terminal.qrTtlSeconds', { infer: true });
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
      throw new ForbiddenException('That store is outside your scope.');
    }
  }

  // ── devices ────────────────────────────────────────────────────────────────
  listDevices(companyId: string, dto: ListDevicesDto): Promise<Device[]> {
    const scope = this.scopedStoreIds();
    if (scope && scope.length === 0) return Promise.resolve([]);
    return this.repo.listDevices(companyId, dto, scope);
  }

  async register(companyId: string, dto: RegisterDeviceDto): Promise<Device> {
    const employee = await this.repo.employeeById(companyId, dto.employeeId);
    if (!employee) throw new NotFoundException('Employee not found.');
    this.assertStoreInScope(employee.primaryStoreId);
    // TODO(Phase 8): enforce per-plan active-device caps with an upgrade nudge.
    return this.repo.createDevice(companyId, {
      companyId,
      employeeId: dto.employeeId,
      label: dto.label,
      platform: dto.platform,
      status: 'registered',
      boundHint: dto.boundHint ?? `tok_${randomBytes(8).toString('hex')}`,
      lastSeen: new Date(),
    });
  }

  /** Unbind a device so the employee can re-register a new one. */
  async reset(companyId: string, id: string): Promise<Device> {
    const device = await this.repo.findDevice(companyId, id);
    if (!device) throw new NotFoundException('Device not found.');
    this.assertStoreInScope(device.employee?.primaryStoreId ?? null);
    return this.repo.updateDevice(companyId, id, { status: 'reset', boundHint: null });
  }

  async blockDevice(companyId: string, id: string): Promise<Device> {
    const device = await this.repo.findDevice(companyId, id);
    if (!device) throw new NotFoundException('Device not found.');
    this.assertStoreInScope(device.employee?.primaryStoreId ?? null);
    return this.repo.updateDevice(companyId, id, { status: 'blocked' });
  }

  // ── terminals ────────────────────────────────────────────────────────────
  listTerminals(companyId: string): Promise<Terminal[]> {
    const scope = this.scopedStoreIds();
    if (scope && scope.length === 0) return Promise.resolve([]);
    return this.repo.listTerminals(companyId, scope);
  }

  async createTerminal(companyId: string, dto: CreateTerminalDto): Promise<Terminal> {
    this.assertStoreInScope(dto.storeId);
    // One terminal per store (point 20) — defense in depth above the unique index.
    const existing = await this.repo.findTerminalByStore(companyId, dto.storeId);
    if (existing) {
      throw new ConflictException(
        'This store already has a terminal. Delete the existing one to create a new terminal.',
      );
    }
    return this.repo.createTerminal(companyId, {
      companyId,
      storeId: dto.storeId,
      label: dto.label,
      status: 'pending',
    });
  }

  async authorizeTerminal(companyId: string, id: string): Promise<Terminal> {
    await this.getTerminal(companyId, id);
    return this.repo.updateTerminal(companyId, id, {
      status: 'active',
      qrSecret: newSecret(),
      qrRotatedAt: new Date(),
      deactivatedBy: null,
      deactivatedAt: null,
    });
  }

  async blockTerminal(companyId: string, id: string): Promise<Terminal> {
    await this.getTerminal(companyId, id);
    return this.repo.updateTerminal(companyId, id, { status: 'blocked', qrSecret: null });
  }

  /** Freeze a terminal (super-admin / owner) without deleting — no punches while
   * inactive. Differs from delete (which frees the store for a new terminal). */
  async deactivateTerminal(companyId: string, id: string): Promise<Terminal> {
    await this.getTerminal(companyId, id);
    return this.repo.updateTerminal(companyId, id, {
      status: 'inactive',
      qrSecret: null,
      deactivatedBy: this.tenant.get()?.user.userId ?? null,
      deactivatedAt: new Date(),
    });
  }

  /** Re-activate a frozen terminal and rotate a fresh QR secret. */
  async reactivateTerminal(companyId: string, id: string): Promise<Terminal> {
    const terminal = await this.getTerminal(companyId, id);
    if (terminal.status !== 'inactive') {
      throw new ConflictException('Only an inactive terminal can be reactivated.');
    }
    return this.repo.updateTerminal(companyId, id, {
      status: 'active',
      qrSecret: newSecret(),
      qrRotatedAt: new Date(),
      deactivatedBy: null,
      deactivatedAt: null,
    });
  }

  /** Permanently remove a terminal (frees the store to create a new one). */
  async deleteTerminal(companyId: string, id: string): Promise<{ id: string }> {
    await this.getTerminal(companyId, id);
    await this.repo.deleteTerminal(companyId, id);
    return { id };
  }

  /**
   * Returns the current clock-in QR payload, rotating the secret if it has gone
   * stale (TTL = `TERMINAL_QR_TTL_SECONDS`). The kiosk should also poll/refresh
   * a few seconds before `expiresAt`. TODO(Phase 6): move rotation to a BullMQ job.
   */
  async getQr(companyId: string, id: string) {
    let terminal = await this.getTerminal(companyId, id);
    if (terminal.status !== 'active') {
      throw new ForbiddenException('Terminal is not authorized.');
    }
    const ttlMs = this.qrTtlSeconds * 1000;
    const stale =
      !terminal.qrSecret ||
      !terminal.qrRotatedAt ||
      Date.now() - terminal.qrRotatedAt.getTime() > ttlMs;
    if (stale) {
      terminal = await this.repo.updateTerminal(companyId, id, {
        qrSecret: newSecret(),
        qrRotatedAt: new Date(),
        lastSeen: new Date(),
      });
    }
    const payload = Buffer.from(`${terminal.id}:${terminal.qrSecret}`).toString('base64url');
    const rotatedAt = terminal.qrRotatedAt ?? new Date();
    const expiresAt = new Date(rotatedAt.getTime() + ttlMs);
    return {
      terminalId: terminal.id,
      storeId: terminal.storeId,
      payload,
      rotatedAt: rotatedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      ttlSeconds: this.qrTtlSeconds,
    };
  }

  /**
   * Validates a scanned QR payload (`base64url(terminalId:secret)`): the terminal
   * must be active, the secret must match the CURRENT secret, and it must be
   * within the TTL window. Returns the terminal so the punch can be stamped with
   * `storeId` + `terminalId`. Throws a clear error otherwise (expired/invalid).
   *
   * Runs RLS-scoped to `companyId` — the scan route resolves the tenant from the
   * authenticated user, never from the QR.
   */
  async validateQrToken(companyId: string, token: string): Promise<Terminal> {
    let decoded: string;
    try {
      decoded = Buffer.from(token, 'base64url').toString('utf8');
    } catch {
      throw new ForbiddenException('Invalid QR code.');
    }
    const sep = decoded.indexOf(':');
    if (sep < 0) throw new ForbiddenException('Invalid QR code.');
    const terminalId = decoded.slice(0, sep);
    const secret = decoded.slice(sep + 1);

    const terminal = await this.repo.findTerminal(companyId, terminalId);
    if (!terminal) throw new NotFoundException('Terminal not found.');
    if (terminal.status !== 'active') {
      throw new ForbiddenException('This terminal is not active.');
    }
    if (!terminal.qrSecret || !secret || terminal.qrSecret !== secret) {
      throw new ForbiddenException('This QR code is no longer valid. Please scan again.');
    }
    if (
      !terminal.qrRotatedAt ||
      Date.now() - terminal.qrRotatedAt.getTime() > this.qrTtlSeconds * 1000
    ) {
      throw new ForbiddenException('This QR code has expired. Please scan again.');
    }
    return terminal;
  }

  private async getTerminal(companyId: string, id: string): Promise<Terminal> {
    const terminal = await this.repo.findTerminal(companyId, id);
    if (!terminal) throw new NotFoundException('Terminal not found.');
    this.assertStoreInScope(terminal.storeId);
    return terminal;
  }
}

function newSecret(): string {
  return randomBytes(16).toString('hex');
}
