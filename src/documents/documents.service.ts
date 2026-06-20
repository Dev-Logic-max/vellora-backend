import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import type { Document, Signature } from '../database/schema';
import { QueueService } from '../infra/queue.service';
import { StorageService } from '../infra/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import type {
  BulkCreateDto,
  CreateDocumentDto,
  CreateFolderDto,
  ListDocumentsDto,
  RequestSignatureDto,
  RequestUploadDto,
  SignDto,
  UpdateDocumentDto,
  UpdateFolderDto,
} from './dto/documents.dto';
import { DocumentsRepository } from './documents.repository';

export const DOC_PURGE_QUEUE = 'doc-purge';
const TRASH_PURGE_DAYS = 30;

/**
 * Tenant-scoped document storage (08-documents). Files live in a PRIVATE
 * Supabase Storage bucket and are ONLY ever reached through short-lived signed
 * URLs — never public. On top of RLS, visibility rules + manager scope limit
 * who can read each file; out-of-scope reads 404.
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly repo: DocumentsRepository,
    private readonly storage: StorageService,
    private readonly tenant: TenantContextService,
    private readonly notifications: NotificationsService,
    private readonly queue: QueueService,
    private readonly audit: AuditService,
  ) {
    this.queue.register(DOC_PURGE_QUEUE, async (job) => {
      const { companyId } = job.data as { companyId: string };
      await this.purgeTrash(companyId);
    });
  }

  private user() {
    return this.tenant.get()?.user;
  }

  private isManager(): boolean {
    const role = this.user()?.role;
    return role === 'owner' || role === 'hr' || role === 'area_manager' || role === 'store_manager';
  }

  /** Out-of-scope readers get a 404 — they cannot tell the doc exists. */
  private assertCanRead(doc: Document): void {
    const user = this.user();
    if (!user) throw new NotFoundException('Document not found.');
    if (this.isManager()) return;
    if (doc.visibility === 'company') return;
    if (doc.visibility === 'employee' && doc.employeeId && doc.ownerId === user.userId) return;
    // Employees may read their own assigned docs; everything else is hidden.
    if (doc.ownerId === user.userId) return;
    throw new NotFoundException('Document not found.');
  }

  // ── folders ─────────────────────────────────────────────────────────────
  listFolders(companyId: string) {
    return this.repo.listFolders(companyId);
  }

  createFolder(companyId: string, dto: CreateFolderDto) {
    return this.repo.createFolder(companyId, { companyId, ...dto });
  }

  async updateFolder(companyId: string, id: string, dto: UpdateFolderDto) {
    const folder = await this.repo.findFolder(companyId, id);
    if (!folder) throw new NotFoundException('Folder not found.');
    return this.repo.updateFolder(companyId, id, {
      name: dto.name,
      parentId: dto.parentId ?? undefined,
    });
  }

  async deleteFolder(companyId: string, id: string): Promise<{ ok: true }> {
    const folder = await this.repo.findFolder(companyId, id);
    if (!folder) throw new NotFoundException('Folder not found.');
    await this.repo.deleteFolder(companyId, id);
    return { ok: true };
  }

  // ── documents ─────────────────────────────────────────────────────────────
  list(companyId: string, dto: ListDocumentsDto) {
    return this.repo.list(companyId, dto);
  }

  /** Step 1: hand back a short-lived SIGNED upload URL into the private bucket. */
  requestUpload(companyId: string, dto: RequestUploadDto) {
    if (!this.isManager()) throw new ForbiddenException('Only managers can upload company docs.');
    return this.storage.createSignedUpload(companyId, dto.filename);
  }

  /** Step 2: persist the document row once bytes are uploaded. */
  create(companyId: string, dto: CreateDocumentDto): Promise<Document> {
    return this.repo.create(companyId, {
      companyId,
      name: dto.name,
      storageKey: dto.storageKey,
      folderId: dto.folderId,
      category: dto.category,
      mime: dto.mime,
      size: dto.size,
      visibility: dto.visibility ?? 'company',
      employeeId: dto.employeeId,
      ownerId: this.user()?.userId,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
    });
  }

  bulkCreate(companyId: string, dto: BulkCreateDto): Promise<Document[]> {
    const ownerId = this.user()?.userId;
    return this.repo.createMany(
      companyId,
      dto.files.map((f) => ({
        companyId,
        name: f.name,
        storageKey: f.storageKey,
        folderId: dto.folderId,
        category: dto.category,
        mime: f.mime,
        size: f.size,
        visibility: dto.visibility ?? 'company',
        ownerId,
      })),
    );
  }

  async update(companyId: string, id: string, dto: UpdateDocumentDto): Promise<Document> {
    const doc = await this.repo.find(companyId, id);
    if (!doc) throw new NotFoundException('Document not found.');
    if (!this.isManager()) throw new ForbiddenException('Only managers can edit documents.');
    return this.repo.update(companyId, id, {
      name: dto.name,
      folderId: dto.folderId ?? undefined,
      category: dto.category ?? undefined,
      visibility: dto.visibility,
      employeeId: dto.employeeId ?? undefined,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
    });
  }

  /** Permission-checked signed download URL. */
  async getDownloadUrl(companyId: string, id: string): Promise<{ url: string; expiresIn: number }> {
    const doc = await this.repo.find(companyId, id);
    if (!doc) throw new NotFoundException('Document not found.');
    this.assertCanRead(doc);
    const url = await this.storage.createSignedDownload(doc.storageKey);
    return { url, expiresIn: 300 };
  }

  // ── trash → restore → purge ────────────────────────────────────────────────
  async softDelete(companyId: string, id: string): Promise<{ ok: true }> {
    const doc = await this.repo.find(companyId, id);
    if (!doc) throw new NotFoundException('Document not found.');
    if (!this.isManager()) throw new ForbiddenException('Only managers can delete documents.');
    const purgeAfter = new Date(Date.now() + TRASH_PURGE_DAYS * 86_400_000);
    await this.repo.createTrash(companyId, {
      companyId,
      documentId: doc.id,
      snapshot: doc,
      storageKey: doc.storageKey,
      deletedBy: this.user()?.userId,
      purgeAfter,
    });
    await this.repo.update(companyId, id, { status: 'trashed' });
    return { ok: true };
  }

  listTrash(companyId: string) {
    return this.repo.listTrash(companyId);
  }

  async restore(companyId: string, trashId: string): Promise<Document> {
    const entry = await this.repo.findTrash(companyId, trashId);
    if (!entry) throw new NotFoundException('Trash entry not found.');
    const restored = await this.repo.update(companyId, entry.documentId, { status: 'active' });
    await this.repo.deleteTrash(companyId, trashId);
    return restored;
  }

  /** Permanent delete — removes the row, the bucket object, and the trash entry. */
  async purge(companyId: string, trashId: string): Promise<{ ok: true }> {
    const entry = await this.repo.findTrash(companyId, trashId);
    if (!entry) throw new NotFoundException('Trash entry not found.');
    await this.storage.remove([entry.storageKey]);
    await this.repo.hardDelete(companyId, entry.documentId);
    await this.repo.deleteTrash(companyId, trashId);
    return { ok: true };
  }

  /** Scheduled (BullMQ) purge of every entry past its purge-after window. */
  async purgeTrash(companyId: string): Promise<{ purged: number }> {
    const due = await this.repo.purgeable(companyId, new Date());
    for (const entry of due) {
      await this.storage.remove([entry.storageKey]);
      await this.repo.hardDelete(companyId, entry.documentId);
      await this.repo.deleteTrash(companyId, entry.id);
    }
    return { purged: due.length };
  }

  // ── e-signature (paid) ─────────────────────────────────────────────────────
  async requestSignatures(
    companyId: string,
    documentId: string,
    dto: RequestSignatureDto,
  ): Promise<Signature[]> {
    const doc = await this.repo.find(companyId, documentId);
    if (!doc) throw new NotFoundException('Document not found.');
    const created: Signature[] = [];
    for (const signerId of dto.signerIds) {
      const sig = await this.repo.createSignature(companyId, {
        companyId,
        documentId,
        signerId,
        status: 'requested',
      });
      created.push(sig);
      await this.notifications.emit({
        companyId,
        userId: signerId,
        category: 'documents',
        type: 'signature.requested',
        priority: 'high',
        title: 'Signature requested',
        body: `Please sign "${doc.name}".`,
        href: `/documents/${documentId}`,
      });
    }
    return created;
  }

  /** Capture a typed/drawn signature, store a signed copy, write the audit trail. */
  async sign(companyId: string, signatureId: string, dto: SignDto): Promise<Signature> {
    const sig = await this.repo.findSignature(companyId, signatureId);
    if (!sig) throw new NotFoundException('Signature request not found.');
    const user = this.user();
    if (sig.signerId !== user?.userId) {
      throw new ForbiddenException('Only the requested signer can sign.');
    }
    if (sig.status !== 'requested') throw new ForbiddenException('This request is already closed.');

    const doc = await this.repo.find(companyId, sig.documentId);
    // Store a signed copy alongside the original (best-effort in stub mode).
    const signedKey = `${doc?.storageKey ?? sig.documentId}.signed`;
    if (doc) await this.storage.copy(doc.storageKey, signedKey);

    const updated = await this.repo.updateSignature(companyId, signatureId, {
      status: 'signed',
      signedStorageKey: signedKey,
      signedAt: new Date(),
      audit: {
        method: dto.method,
        name: dto.method === 'typed' ? dto.value : (user?.name ?? user?.email),
        consent: dto.consent,
        signedAt: new Date().toISOString(),
        signerId: user?.userId,
      },
    });
    await this.audit.log({
      companyId,
      actorUserId: user?.userId,
      action: 'document.signed',
      resource: 'document',
      targetId: sig.documentId,
      meta: { signatureId, method: dto.method },
    });
    return updated;
  }

  // ── expiry scan (BullMQ) ────────────────────────────────────────────────────
  /**
   * Flags documents within 30d as `expiring` and past-due as `expired`, and
   * notifies the owner. Driven by a repeatable BullMQ cron in prod.
   */
  async runExpiryScan(companyId: string): Promise<{ flagged: number }> {
    const soon = new Date(Date.now() + 30 * 86_400_000);
    const now = new Date();
    const candidates = await this.repo.expiringBefore(companyId, soon);
    let flagged = 0;
    for (const doc of candidates) {
      if (!doc.expiresAt) continue;
      const expired = doc.expiresAt <= now;
      await this.repo.update(companyId, doc.id, { status: expired ? 'expired' : 'expiring' });
      if (doc.ownerId) {
        await this.notifications.emit({
          companyId,
          userId: doc.ownerId,
          category: 'documents',
          type: expired ? 'document.expired' : 'document.expiring',
          priority: expired ? 'urgent' : 'high',
          title: expired ? 'Document expired' : 'Document expiring soon',
          body: `"${doc.name}" ${expired ? 'has expired' : 'expires within 30 days'}.`,
          href: `/documents/${doc.id}`,
        });
      }
      flagged += 1;
    }
    return { flagged };
  }
}
