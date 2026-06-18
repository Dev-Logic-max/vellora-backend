import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { BILLING_MODES } from '../../database/schema/enums';

export const createGroupSchema = z.object({
  name: z.string().min(2).max(120),
  logoUrl: z.string().url().optional(),
  billingMode: z.enum(BILLING_MODES).optional(),
});
export class CreateGroupDto extends createZodDto(createGroupSchema) {}

export const updateGroupSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  logoUrl: z.string().url().nullable().optional(),
  billingMode: z.enum(BILLING_MODES).optional(),
  ownerUserIds: z.array(z.uuid()).min(1).optional(),
});
export class UpdateGroupDto extends createZodDto(updateGroupSchema) {}
