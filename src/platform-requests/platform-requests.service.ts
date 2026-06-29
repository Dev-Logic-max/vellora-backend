import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { companies, memberships, stores } from '../database/schema';
import { NotificationsService } from '../notifications/notifications.service';
import { PlatformRequestsRepository } from './platform-requests.repository';
import type {
  CreateRequestDto,
  DeletionRequestDto,
  RespondRequestDto,
  StoreDeletionRequestDto,
} from './dto/platform-requests.dto';

/**
 * Tenant→platform request inbox. Tenants raise requests (a type-to-confirm
 * company-deletion request, reports, support queries); platform operators triage,
 * respond, and (for deletion requests) carry out the deletion. The request row is
 * the source of truth shown in the admin Requests tab.
 */
@Injectable()
export class PlatformRequestsService {
  constructor(
    private readonly repo: PlatformRequestsRepository,
    private readonly db: DatabaseService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── tenant side ──────────────────────────────────────────────────────────────
  async create(companyId: string, userId: string, dto: CreateRequestDto) {
    if (dto.type === 'company_deletion') {
      throw new BadRequestException('Use the company-deletion endpoint for deletion requests.');
    }
    return this.repo.create(companyId, {
      companyId,
      type: dto.type,
      module: dto.module,
      priority: dto.priority ?? 'medium',
      subject: dto.subject,
      message: dto.message,
      requestedBy: userId,
    });
  }

  listForCompany(companyId: string) {
    return this.repo.listForCompany(companyId);
  }

  /**
   * A company owner requests deletion of their OWN company. Guarded by typing the
   * exact company name; raises an urgent request to the platform (the actual
   * delete is a super-admin action via the admin endpoint).
   */
  async requestDeletion(companyId: string, userId: string, dto: DeletionRequestDto) {
    await this.assertOwner(companyId, userId);
    const company = await this.db.db.query.companies.findFirst({
      where: eq(companies.id, companyId),
      columns: { name: true },
    });
    if (!company) throw new NotFoundException('Company not found.');
    if (dto.confirmName.trim() !== company.name.trim()) {
      throw new BadRequestException('The typed name does not match the company name.');
    }
    const existing = await this.repo.findOpenByType(companyId, 'company_deletion');
    if (existing) {
      throw new ConflictException('A deletion request is already pending for this company.');
    }
    return this.repo.create(companyId, {
      companyId,
      type: 'company_deletion',
      module: 'Companies',
      priority: 'urgent',
      subject: `Delete company "${company.name}"`,
      message: dto.reason,
      requestedBy: userId,
      meta: { confirmName: dto.confirmName },
    });
  }

  /**
   * Owner/HR requests deletion of one of their stores. Type-to-confirm the store
   * name; raises a high-priority Stores request carrying the store id in meta so
   * a platform operator can approve + archive it.
   */
  async requestStoreDeletion(companyId: string, userId: string, dto: StoreDeletionRequestDto) {
    const store = await this.db.db.query.stores.findFirst({
      where: and(eq(stores.id, dto.storeId), eq(stores.companyId, companyId)),
      columns: { name: true },
    });
    if (!store) throw new NotFoundException('Store not found.');
    if (dto.confirmName.trim() !== store.name.trim()) {
      throw new BadRequestException('The typed name does not match the store name.');
    }
    return this.repo.create(companyId, {
      companyId,
      type: 'support',
      module: 'Stores',
      priority: 'high',
      subject: `Delete store "${store.name}"`,
      message: dto.reason,
      requestedBy: userId,
      meta: { storeId: dto.storeId, kind: 'store_deletion', confirmName: dto.confirmName },
    });
  }

  // ── platform side ──────────────────────────────────────────────────────────────
  listAll() {
    return this.repo.listAll();
  }

  /**
   * Approve + execute a store-deletion request (platform). Archives the store
   * (status → 'archived', reversible) and resolves the request.
   */
  async approveStoreDeletion(actorUserId: string, id: string) {
    const req = await this.repo.getById(id);
    if (!req) throw new NotFoundException('Request not found.');
    const meta = (req.meta ?? {}) as { storeId?: string; kind?: string };
    if (meta.kind !== 'store_deletion' || !meta.storeId) {
      throw new BadRequestException('This request is not a store-deletion request.');
    }
    await this.db.db
      .update(stores)
      .set({ status: 'archived' })
      .where(and(eq(stores.id, meta.storeId), eq(stores.companyId, req.companyId)));
    const updated = await this.repo.update(id, {
      status: 'resolved',
      actionStatus: 'closed',
      handledBy: actorUserId,
      resolvedAt: new Date(),
      response: 'Store deletion approved and processed (archived).',
    });
    await this.notifyRequester(updated.companyId, updated.requestedBy, updated.subject, 'resolved');
    return updated;
  }

  /** Operator responds / changes the record status; mirrors a user-facing action status. */
  async respond(actorUserId: string, id: string, dto: RespondRequestDto) {
    const req = await this.repo.getById(id);
    if (!req) throw new NotFoundException('Request not found.');
    const status = dto.status ?? req.status;
    const actionStatus =
      status === 'resolved' || status === 'rejected'
        ? 'closed'
        : status === 'replied'
          ? 'responded'
          : status === 'in_review'
            ? 'read'
            : req.actionStatus;
    const updated = await this.repo.update(id, {
      status,
      actionStatus,
      response: dto.response ?? req.response,
      handledBy: actorUserId,
      resolvedAt: status === 'resolved' || status === 'rejected' ? new Date() : req.resolvedAt,
    });
    await this.notifyRequester(updated.companyId, updated.requestedBy, updated.subject, status);
    return updated;
  }

  /**
   * Approve + execute a company-deletion request (super-admin). Soft-deletes the
   * company (status → 'deleted') and resolves the request. Hard data removal is a
   * separate ops step (kept reversible here by design).
   */
  async approveDeletion(actorUserId: string, id: string) {
    const req = await this.repo.getById(id);
    if (!req) throw new NotFoundException('Request not found.');
    if (req.type !== 'company_deletion') {
      throw new BadRequestException('This request is not a company-deletion request.');
    }
    await this.db.db
      .update(companies)
      .set({ status: 'deleted' })
      .where(eq(companies.id, req.companyId));
    const updated = await this.repo.update(id, {
      status: 'resolved',
      actionStatus: 'closed',
      handledBy: actorUserId,
      resolvedAt: new Date(),
      response: 'Company deletion approved and processed.',
    });
    await this.notifyRequester(updated.companyId, updated.requestedBy, updated.subject, 'resolved');
    return updated;
  }

  // ── helpers ──────────────────────────────────────────────────────────────────
  private async assertOwner(companyId: string, userId: string): Promise<void> {
    const membership = await this.db.db.query.memberships.findFirst({
      where: and(
        eq(memberships.companyId, companyId),
        eq(memberships.userId, userId),
        eq(memberships.status, 'active'),
      ),
    });
    if (!membership || membership.role !== 'owner') {
      throw new ForbiddenException('Only the company owner can request deletion.');
    }
  }

  private async notifyRequester(
    companyId: string,
    userId: string | null,
    subject: string,
    status: string,
  ): Promise<void> {
    if (!userId) return;
    // Best-effort — never fail the request flow on a notification hiccup.
    try {
      await this.notifications.emit({
        companyId,
        userId,
        category: 'system',
        type: 'platform_request.update',
        title: 'Platform request update',
        body: `"${subject}" is now ${status}.`,
        href: '/settings',
      });
    } catch {
      // swallow — the request row already reflects the new status.
    }
  }
}
