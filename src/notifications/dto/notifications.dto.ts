import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { DIGEST_FREQS, NOTIF_PRIORITIES } from '../../database/schema/enums';

export const listNotificationsSchema = z.object({
  unread: z.coerce.boolean().optional(),
  category: z.string().max(40).optional(),
  priority: z.enum(NOTIF_PRIORITIES).optional(),
});
export class ListNotificationsDto extends createZodDto(listNotificationsSchema) {}

export const updatePreferenceSchema = z.object({
  category: z.string().min(1).max(40),
  inApp: z.boolean().optional(),
  email: z.boolean().optional(),
  push: z.boolean().optional(),
  digest: z.enum(DIGEST_FREQS).optional(),
});
export class UpdatePreferenceDto extends createZodDto(updatePreferenceSchema) {}

export const broadcastSchema = z.object({
  category: z.string().min(1).max(40).default('system'),
  type: z.string().min(1).max(40).default('announcement'),
  priority: z.enum(NOTIF_PRIORITIES).optional(),
  title: z.string().min(1).max(160),
  body: z.string().max(2000).optional(),
  href: z.string().max(500).optional(),
  /** Limit to a role; omit to send to everyone in the company. */
  role: z.string().max(40).optional(),
});
export class BroadcastDto extends createZodDto(broadcastSchema) {}
