import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, ilike, lte, type SQL } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import {
  docFolders,
  docTrash,
  documents,
  signatures,
  type DocFolder,
  type DocTrashEntry,
  type Document,
  type NewDocFolder,
  type NewDocTrashEntry,
  type NewDocument,
  type NewSignature,
  type Signature,
} from '../database/schema';

/** All documents Drizzle access, RLS-scoped via DatabaseService.withTenant. */
@Injectable()
export class DocumentsRepository {
  constructor(private readonly db: DatabaseService) {}

  // ── folders ─────────────────────────────────────────────────────────────
  listFolders(companyId: string): Promise<DocFolder[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.docFolders.findMany({ orderBy: asc(docFolders.name), limit: 1000 }),
    );
  }

  findFolder(companyId: string, id: string) {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.docFolders.findFirst({ where: eq(docFolders.id, id) }),
    );
  }

  createFolder(companyId: string, values: NewDocFolder): Promise<DocFolder> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx.insert(docFolders).values(values).returning();
      return row;
    });
  }

  updateFolder(companyId: string, id: string, values: Partial<NewDocFolder>): Promise<DocFolder> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx
        .update(docFolders)
        .set(values)
        .where(eq(docFolders.id, id))
        .returning();
      return row;
    });
  }

  deleteFolder(companyId: string, id: string): Promise<void> {
    return this.db.withTenant(companyId, async (tx) => {
      await tx.delete(docFolders).where(eq(docFolders.id, id));
    });
  }

  // ── documents ─────────────────────────────────────────────────────────────
  list(
    companyId: string,
    filters: { folderId?: string; employeeId?: string; status?: Document['status']; q?: string },
  ): Promise<Document[]> {
    const conds: SQL[] = [];
    if (filters.folderId) conds.push(eq(documents.folderId, filters.folderId));
    if (filters.employeeId) conds.push(eq(documents.employeeId, filters.employeeId));
    conds.push(eq(documents.status, filters.status ?? 'active'));
    if (filters.q) conds.push(ilike(documents.name, `%${filters.q}%`));
    return this.db.withTenant(companyId, (tx) =>
      tx.query.documents.findMany({
        where: and(...conds),
        orderBy: desc(documents.createdAt),
        limit: 500,
      }),
    );
  }

  find(companyId: string, id: string) {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.documents.findFirst({
        where: eq(documents.id, id),
        with: { signatures: true },
      }),
    );
  }

  create(companyId: string, values: NewDocument): Promise<Document> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx.insert(documents).values(values).returning();
      return row;
    });
  }

  createMany(companyId: string, values: NewDocument[]): Promise<Document[]> {
    return this.db.withTenant(companyId, (tx) => tx.insert(documents).values(values).returning());
  }

  update(companyId: string, id: string, values: Partial<NewDocument>): Promise<Document> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx.update(documents).set(values).where(eq(documents.id, id)).returning();
      return row;
    });
  }

  hardDelete(companyId: string, id: string): Promise<void> {
    return this.db.withTenant(companyId, async (tx) => {
      await tx.delete(documents).where(eq(documents.id, id));
    });
  }

  /** Active docs whose expiry falls on/before `at` — for the expiry scan job. */
  expiringBefore(companyId: string, at: Date): Promise<Document[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.documents.findMany({
        where: and(eq(documents.status, 'active'), lte(documents.expiresAt, at)),
        limit: 1000,
      }),
    );
  }

  // ── signatures ──────────────────────────────────────────────────────────
  createSignature(companyId: string, values: NewSignature): Promise<Signature> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx.insert(signatures).values(values).returning();
      return row;
    });
  }

  findSignature(companyId: string, id: string) {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.signatures.findFirst({ where: eq(signatures.id, id) }),
    );
  }

  updateSignature(
    companyId: string,
    id: string,
    values: Partial<NewSignature>,
  ): Promise<Signature> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx
        .update(signatures)
        .set(values)
        .where(eq(signatures.id, id))
        .returning();
      return row;
    });
  }

  // ── trash ───────────────────────────────────────────────────────────────
  listTrash(companyId: string): Promise<DocTrashEntry[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.docTrash.findMany({ orderBy: desc(docTrash.createdAt), limit: 500 }),
    );
  }

  findTrash(companyId: string, id: string) {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.docTrash.findFirst({ where: eq(docTrash.id, id) }),
    );
  }

  createTrash(companyId: string, values: NewDocTrashEntry): Promise<DocTrashEntry> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx.insert(docTrash).values(values).returning();
      return row;
    });
  }

  deleteTrash(companyId: string, id: string): Promise<void> {
    return this.db.withTenant(companyId, async (tx) => {
      await tx.delete(docTrash).where(eq(docTrash.id, id));
    });
  }

  purgeable(companyId: string, at: Date): Promise<DocTrashEntry[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.docTrash.findMany({ where: lte(docTrash.purgeAfter, at), limit: 1000 }),
    );
  }
}
