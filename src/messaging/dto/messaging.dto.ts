import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const REF_TYPES = ['employee', 'shift', 'leave', 'document', 'candidate', 'store'] as const;

const messageRefSchema = z.object({
  type: z.enum(REF_TYPES),
  id: z.uuid(),
  label: z.string().max(160).optional(),
});

// ── conversations ────────────────────────────────────────────────────────────
export const createConversationSchema = z
  .object({
    kind: z.enum(['dm', 'channel']),
    /** Required for channels; ignored for DMs. */
    name: z.string().min(1).max(120).optional(),
    storeId: z.uuid().optional(),
    /** Other member user ids (the creator is added automatically). */
    memberIds: z.array(z.uuid()).max(200).default([]),
  })
  .refine((v) => v.kind !== 'channel' || Boolean(v.name), {
    message: 'Channels require a name.',
    path: ['name'],
  })
  .refine((v) => v.kind !== 'dm' || v.memberIds.length === 1, {
    message: 'A DM needs exactly one other member.',
    path: ['memberIds'],
  });
export class CreateConversationDto extends createZodDto(createConversationSchema) {}

export const addMembersSchema = z.object({
  memberIds: z.array(z.uuid()).min(1).max(200),
});
export class AddMembersDto extends createZodDto(addMembersSchema) {}

// ── messages ─────────────────────────────────────────────────────────────────
export const sendMessageSchema = z.object({
  body: z.string().min(1).max(4000),
  ref: messageRefSchema.optional(),
});
export class SendMessageDto extends createZodDto(sendMessageSchema) {}

export const searchMessagesSchema = z.object({
  q: z.string().min(1).max(120),
});
export class SearchMessagesDto extends createZodDto(searchMessagesSchema) {}

// ── email ─────────────────────────────────────────────────────────────────────
export const sendEmailSchema = z.object({
  /** Reuse an existing thread, or omit + provide subject to start one. */
  threadId: z.uuid().optional(),
  subject: z.string().min(1).max(200).optional(),
  to: z.array(z.email()).min(1).max(50),
  body: z.string().min(1).max(20_000),
});
export class SendEmailDto extends createZodDto(sendEmailSchema) {}
