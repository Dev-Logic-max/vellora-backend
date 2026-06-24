import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration';
import { BillingService } from '../billing/billing.service';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MEMBERSHIP_ROLES, type MembershipRole } from '../database/schema/enums';
import { ActivationRequestsRepository } from './activation-requests.repository';

/** Authority order (lower index = higher authority). A user may only assign a
 * role strictly BELOW their own — they cannot create a same-or-higher role. */
const ROLE_ORDER: MembershipRole[] = [...MEMBERSHIP_ROLES];

export function roleRank(role: MembershipRole): number {
  return ROLE_ORDER.indexOf(role);
}

/** Roles the given actor may assign (strictly below their own). */
export function assignableRoles(actor: MembershipRole | null | undefined): MembershipRole[] {
  if (!actor) return [];
  return ROLE_ORDER.filter((r) => roleRank(r) > roleRank(actor));
}

const COOLDOWN_MS = 24 * 60 * 60 * 1000;

/**
 * The user-activation workflow. A login created by an upper-role user (or a
 * self-registration) lands as a PENDING request + INACTIVE membership intent;
 * HR/admins approve (→ Supabase invite + active membership, gated by the plan's
 * active-user cap) or reject (→ 24h re-apply cooldown). Notifies all approvers.
 */
@Injectable()
export class ActivationRequestsService {
  private readonly logger = new Logger(ActivationRequestsService.name);

  constructor(
    private readonly repo: ActivationRequestsRepository,
    private readonly tenant: TenantContextService,
    private readonly notifications: NotificationsService,
    private readonly billing: BillingService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  list(companyId: string, status?: 'pending' | 'approved' | 'rejected') {
    return this.repo.list(companyId, status);
  }

  /**
   * Raise a pending activation request for a provisioned login. Enforces the
   * actor's role ceiling, the 24h reject cooldown, and one-pending-per-email.
   * Called from the employee-create flow (and a future self-register endpoint).
   */
  async raise(input: {
    companyId: string;
    employeeId: string | null;
    email: string;
    role: MembershipRole;
    source?: 'created' | 'self_register';
  }) {
    const actorRole = this.tenant.get()?.user?.role ?? null;
    const actorId = this.tenant.get()?.user?.userId ?? null;
    const source = input.source ?? 'created';

    // Role ceiling: created-by-upper-role can only assign strictly-below roles.
    if (source === 'created' && !assignableRoles(actorRole).includes(input.role)) {
      throw new ForbiddenException('You cannot create a user at or above your own role.');
    }

    // 24h re-apply cooldown after a rejection.
    const latest = await this.repo.findLatestForEmail(input.companyId, input.email);
    if (latest?.status === 'pending') {
      throw new ConflictException('An activation request for this email is already pending.');
    }
    if (latest?.status === 'rejected' && latest.cooldownUntil) {
      if (new Date(latest.cooldownUntil).getTime() > Date.now()) {
        throw new ForbiddenException(
          'This applicant was recently rejected — they may re-apply after 24 hours.',
        );
      }
    }

    const request = await this.repo.create(input.companyId, {
      companyId: input.companyId,
      employeeId: input.employeeId,
      email: input.email,
      requestedRole: input.role,
      source,
      requestedBy: actorId,
      status: 'pending',
    });

    await this.notifyApprovers(input.companyId, input.email, input.role);
    return request;
  }

  /** Fan out an in-app + email notification to every owner/HR in the company. */
  private async notifyApprovers(companyId: string, email: string, role: MembershipRole) {
    const approvers = await this.repo.approverUserIds(companyId);
    for (const userId of approvers) {
      await this.notifications.emit({
        companyId,
        userId,
        category: 'people',
        type: 'activation.requested',
        title: 'New user awaiting activation',
        body: `${email} was added as ${role.replace('_', ' ')} and needs your approval.`,
        href: '/employees/activation',
        priority: 'normal',
      });
    }
  }

  /**
   * Approve a request: enforce the active-user plan cap, send the Supabase invite
   * (the person sets their own password), then create the user + active
   * membership and link the employee.
   */
  async approve(companyId: string, id: string, redirectTo?: string) {
    const request = await this.repo.findById(companyId, id);
    if (!request) throw new NotFoundException('Activation request not found.');
    if (request.status !== 'pending') {
      throw new BadRequestException('This request has already been decided.');
    }

    // Seat cap: only active memberships count toward the plan.
    await this.billing.assertActiveUserLimit(companyId, 1);

    const supabaseUid = await this.sendSupabaseInvite(request.email, redirectTo);
    if (!supabaseUid) {
      throw new BadRequestException(
        'Could not send the invite (Supabase not configured). Activation aborted.',
      );
    }

    const { membershipId } = await this.repo.provisionActiveMembership({
      companyId,
      employeeId: request.employeeId,
      email: request.email,
      name: null,
      supabaseUid,
      role: request.requestedRole,
    });

    const decidedBy = this.tenant.get()?.user?.userId ?? null;
    const updated = await this.repo.update(companyId, id, {
      status: 'approved',
      membershipId,
      decidedBy,
      decidedAt: new Date(),
    });
    return updated;
  }

  /** Reject a request and start a 24h re-apply cooldown. */
  async reject(companyId: string, id: string, reason?: string) {
    const request = await this.repo.findById(companyId, id);
    if (!request) throw new NotFoundException('Activation request not found.');
    if (request.status !== 'pending') {
      throw new BadRequestException('This request has already been decided.');
    }
    const decidedBy = this.tenant.get()?.user?.userId ?? null;
    return this.repo.update(companyId, id, {
      status: 'rejected',
      rejectReason: reason ?? null,
      decidedBy,
      decidedAt: new Date(),
      cooldownUntil: new Date(Date.now() + COOLDOWN_MS),
    });
  }

  /**
   * Creates a Supabase Auth invite (sends the set-password email) and returns the
   * created user's id (the supabaseUid). Soft-fails to null without a key.
   */
  private async sendSupabaseInvite(email: string, redirectTo?: string): Promise<string | null> {
    const url = this.config.get('supabase.url', { infer: true });
    const serviceKey = this.config.get('supabase.serviceRoleKey', { infer: true });
    if (!url || !serviceKey) {
      this.logger.warn('Supabase service role key not set — cannot invite for activation.');
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
}
