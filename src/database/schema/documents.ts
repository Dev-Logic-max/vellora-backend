import { relations, sql } from 'drizzle-orm';
import { bigint, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { employees } from './employees';
import {
  docFolderKindEnum,
  documentStatusEnum,
  documentVisibilityEnum,
  signatureStatusEnum,
} from './enums';
import { users } from './users';

/**
 * Document storage (08-documents §3). Files live in a PRIVATE Supabase Storage
 * bucket — only ever reached through short-lived signed URLs, never public.
 * Tenant-scoped + RLS on company_id.
 */
export const docFolders = pgTable(
  'doc_folders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id'),
    name: text('name').notNull(),
    kind: docFolderKindEnum('kind').notNull().default('company'),
    /** Set when `kind = 'employee'` — the employee whose files this folder holds. */
    employeeId: uuid('employee_id').references(() => employees.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('doc_folders_company_id_idx').on(table.companyId),
    index('doc_folders_parent_id_idx').on(table.parentId),
  ],
);

/** A stored file. `storageKey` is the object path in the private bucket. */
export const documents = pgTable(
  'documents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    folderId: uuid('folder_id').references(() => docFolders.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    category: text('category'),
    /** Object path in the private Supabase Storage bucket. Never exposed raw. */
    storageKey: text('storage_key').notNull(),
    mime: text('mime'),
    size: bigint('size', { mode: 'number' }),
    visibility: documentVisibilityEnum('visibility').notNull().default('company'),
    /** When visibility = 'employee', the single employee who may see it. */
    employeeId: uuid('employee_id').references(() => employees.id, { onDelete: 'set null' }),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    status: documentStatusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('documents_company_id_idx').on(table.companyId),
    index('documents_folder_id_idx').on(table.folderId),
    index('documents_status_idx').on(table.status),
    index('documents_expires_at_idx').on(table.expiresAt),
  ],
);

/** E-signature request + result (08-documents §3, paid). Audit captures consent + method. */
export const signatures = pgTable(
  'signatures',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    signerId: uuid('signer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: signatureStatusEnum('status').notNull().default('requested'),
    /** Object path of the stored signed copy, once signed. */
    signedStorageKey: text('signed_storage_key'),
    signedAt: timestamp('signed_at', { withTimezone: true }),
    /** { method: 'typed'|'drawn', consent: true, name, ip?, ua?, at }. */
    audit: jsonb('audit')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('signatures_company_id_idx').on(table.companyId),
    index('signatures_document_id_idx').on(table.documentId),
  ],
);

/** Soft-deleted documents pending scheduled purge (08-documents §8). */
export const docTrash = pgTable(
  'doc_trash',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id').notNull(),
    /** Snapshot of the document row so it can be restored. */
    snapshot: jsonb('snapshot')
      .notNull()
      .default(sql`'{}'::jsonb`),
    storageKey: text('storage_key').notNull(),
    deletedBy: uuid('deleted_by').references(() => users.id, { onDelete: 'set null' }),
    purgeAfter: timestamp('purge_after', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('doc_trash_company_id_idx').on(table.companyId)],
);

export const docFoldersRelations = relations(docFolders, ({ one, many }) => ({
  parent: one(docFolders, {
    fields: [docFolders.parentId],
    references: [docFolders.id],
    relationName: 'folder_parent',
  }),
  children: many(docFolders, { relationName: 'folder_parent' }),
  employee: one(employees, { fields: [docFolders.employeeId], references: [employees.id] }),
  documents: many(documents),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  folder: one(docFolders, { fields: [documents.folderId], references: [docFolders.id] }),
  employee: one(employees, { fields: [documents.employeeId], references: [employees.id] }),
  owner: one(users, { fields: [documents.ownerId], references: [users.id] }),
  signatures: many(signatures),
}));

export const signaturesRelations = relations(signatures, ({ one }) => ({
  document: one(documents, { fields: [signatures.documentId], references: [documents.id] }),
  signer: one(users, { fields: [signatures.signerId], references: [users.id] }),
}));

export type DocFolder = typeof docFolders.$inferSelect;
export type NewDocFolder = typeof docFolders.$inferInsert;
export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type Signature = typeof signatures.$inferSelect;
export type NewSignature = typeof signatures.$inferInsert;
export type DocTrashEntry = typeof docTrash.$inferSelect;
export type NewDocTrashEntry = typeof docTrash.$inferInsert;
