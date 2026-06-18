import { randomBytes } from 'node:crypto';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import type { Device, Terminal } from '../database/schema';
import { DevicesRepository } from './devices.repository';
import type { CreateTerminalDto, ListDevicesDto, RegisterDeviceDto } from './dto/device.dto';

/** Seconds a terminal QR stays valid before the secret rotates on read. */
const QR_ROTATE_SECONDS = 60;

/**
 * Tenant-scoped device + terminal management. Lightweight binding only — a soft
 * token + hint, never a hardware fingerprint (14-devices-terminals §3). On top
 * of RLS, area/store managers are limited to their own stores.
 */
@Injectable()
export class DevicesService {
  constructor(
    private readonly repo: DevicesRepository,
    private readonly tenant: TenantContextService,
  ) {}

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

  createTerminal(companyId: string, dto: CreateTerminalDto): Promise<Terminal> {
    this.assertStoreInScope(dto.storeId);
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
    });
  }

  async blockTerminal(companyId: string, id: string): Promise<Terminal> {
    await this.getTerminal(companyId, id);
    return this.repo.updateTerminal(companyId, id, { status: 'blocked', qrSecret: null });
  }

  /**
   * Returns the current clock-in QR payload, rotating the secret if it has
   * gone stale. TODO(Phase 6): move rotation to a BullMQ repeatable job.
   */
  async getQr(companyId: string, id: string) {
    let terminal = await this.getTerminal(companyId, id);
    if (terminal.status !== 'active') {
      throw new ForbiddenException('Terminal is not authorized.');
    }
    const stale =
      !terminal.qrSecret ||
      !terminal.qrRotatedAt ||
      Date.now() - terminal.qrRotatedAt.getTime() > QR_ROTATE_SECONDS * 1000;
    if (stale) {
      terminal = await this.repo.updateTerminal(companyId, id, {
        qrSecret: newSecret(),
        qrRotatedAt: new Date(),
        lastSeen: new Date(),
      });
    }
    const payload = Buffer.from(`${terminal.id}:${terminal.qrSecret}`).toString('base64url');
    const rotatedAt = terminal.qrRotatedAt ?? new Date();
    const expiresAt = new Date(rotatedAt.getTime() + QR_ROTATE_SECONDS * 1000);
    return {
      terminalId: terminal.id,
      storeId: terminal.storeId,
      payload,
      rotatedAt: rotatedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      ttlSeconds: QR_ROTATE_SECONDS,
    };
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
