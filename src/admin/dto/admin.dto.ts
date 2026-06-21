import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { MEMBERSHIP_ROLES } from '../../database/schema/enums';

export const setStatusSchema = z.object({
  status: z.enum(['pending', 'active', 'inactive', 'suspended', 'deleted']),
});
export class SetStatusDto extends createZodDto(setStatusSchema) {}

export const assignPlanSchema = z.object({
  planId: z.uuid(),
});
export class AssignPlanDto extends createZodDto(assignPlanSchema) {}

export const overrideSchema = z.object({
  entitlements: z.record(z.string(), z.boolean()).default({}),
  limits: z.record(z.string(), z.number().int()).default({}),
});
export class OverrideDto extends createZodDto(overrideSchema) {}

export const flagSchema = z.object({
  key: z.string().min(1).max(80),
  enabled: z.boolean(),
});
export class FlagDto extends createZodDto(flagSchema) {}

export const impersonateSchema = z.object({
  companyId: z.uuid(),
});
export class ImpersonateDto extends createZodDto(impersonateSchema) {}

/** Cross-tenant permission-matrix edit (platform users editing any company). */
export const adminPermissionsSchema = z.object({
  entries: z
    .array(
      z.object({
        role: z.enum(MEMBERSHIP_ROLES),
        resource: z.string().min(1).max(80),
        allowed: z.boolean(),
      }),
    )
    .min(1),
});
export class AdminPermissionsDto extends createZodDto(adminPermissionsSchema) {}
