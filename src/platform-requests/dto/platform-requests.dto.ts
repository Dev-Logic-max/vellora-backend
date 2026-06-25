import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  PLATFORM_REQUEST_PRIORITIES,
  PLATFORM_REQUEST_STATUSES,
  PLATFORM_REQUEST_TYPES,
} from '../../database/schema/enums';

/** Tenant raises a generic request (report / query / support / feature / billing). */
export const createRequestSchema = z.object({
  type: z.enum(PLATFORM_REQUEST_TYPES),
  module: z.string().max(80).optional(),
  priority: z.enum(PLATFORM_REQUEST_PRIORITIES).optional(),
  subject: z.string().min(2).max(200),
  message: z.string().max(4000).optional(),
});
export class CreateRequestDto extends createZodDto(createRequestSchema) {}

/** Tenant requests deletion of THEIR company — must type the exact name to confirm. */
export const deletionRequestSchema = z.object({
  confirmName: z.string().min(1),
  reason: z.string().max(4000).optional(),
});
export class DeletionRequestDto extends createZodDto(deletionRequestSchema) {}

/** Platform operator responds / updates status on a request. */
export const respondRequestSchema = z.object({
  status: z.enum(PLATFORM_REQUEST_STATUSES).optional(),
  response: z.string().max(4000).optional(),
});
export class RespondRequestDto extends createZodDto(respondRequestSchema) {}
