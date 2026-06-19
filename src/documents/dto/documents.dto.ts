import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  DOC_FOLDER_KINDS,
  DOCUMENT_STATUSES,
  DOCUMENT_VISIBILITIES,
} from '../../database/schema/enums';

// ── folders ──────────────────────────────────────────────────────────────────
export const createFolderSchema = z.object({
  name: z.string().min(1).max(120),
  parentId: z.uuid().optional(),
  kind: z.enum(DOC_FOLDER_KINDS).optional(),
  employeeId: z.uuid().optional(),
});
export class CreateFolderDto extends createZodDto(createFolderSchema) {}

export const updateFolderSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  parentId: z.uuid().nullish(),
});
export class UpdateFolderDto extends createZodDto(updateFolderSchema) {}

// ── documents ─────────────────────────────────────────────────────────────────
export const listDocumentsSchema = z.object({
  folderId: z.uuid().optional(),
  employeeId: z.uuid().optional(),
  status: z.enum(DOCUMENT_STATUSES).optional(),
  q: z.string().max(120).optional(),
});
export class ListDocumentsDto extends createZodDto(listDocumentsSchema) {}

/** Step 1 of upload: ask for a signed upload URL. */
export const requestUploadSchema = z.object({
  filename: z.string().min(1).max(200),
});
export class RequestUploadDto extends createZodDto(requestUploadSchema) {}

/** Step 2: persist the document row once the client has uploaded the bytes. */
export const createDocumentSchema = z.object({
  name: z.string().min(1).max(200),
  storageKey: z.string().min(1).max(500),
  folderId: z.uuid().optional(),
  category: z.string().max(60).optional(),
  mime: z.string().max(120).optional(),
  size: z.coerce.number().int().min(0).optional(),
  visibility: z.enum(DOCUMENT_VISIBILITIES).optional(),
  employeeId: z.uuid().optional(),
  expiresAt: z.string().datetime().optional(),
});
export class CreateDocumentDto extends createZodDto(createDocumentSchema) {}

export const updateDocumentSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  folderId: z.uuid().nullish(),
  category: z.string().max(60).nullish(),
  visibility: z.enum(DOCUMENT_VISIBILITIES).optional(),
  employeeId: z.uuid().nullish(),
  expiresAt: z.string().datetime().nullish(),
});
export class UpdateDocumentDto extends createZodDto(updateDocumentSchema) {}

/** Bulk: one signed URL per file, assign a common folder/category/visibility. */
export const bulkCreateSchema = z.object({
  folderId: z.uuid().optional(),
  category: z.string().max(60).optional(),
  visibility: z.enum(DOCUMENT_VISIBILITIES).optional(),
  files: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        storageKey: z.string().min(1).max(500),
        mime: z.string().max(120).optional(),
        size: z.coerce.number().int().min(0).optional(),
      }),
    )
    .min(1)
    .max(100),
});
export class BulkCreateDto extends createZodDto(bulkCreateSchema) {}

// ── e-sign ────────────────────────────────────────────────────────────────────
export const requestSignatureSchema = z.object({
  signerIds: z.array(z.uuid()).min(1).max(20),
});
export class RequestSignatureDto extends createZodDto(requestSignatureSchema) {}

export const signSchema = z.object({
  method: z.enum(['typed', 'drawn']),
  /** Typed name or a data-URL of the drawn signature. */
  value: z.string().min(1).max(200_000),
  consent: z.literal(true),
});
export class SignDto extends createZodDto(signSchema) {}
