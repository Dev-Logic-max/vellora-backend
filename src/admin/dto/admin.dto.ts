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

/** Pricing-module plan edit/create (super-admin). All fields optional on update;
 * create needs key + name. limits/entitlements are free-form maps. */
export const planUpsertSchema = z.object({
  key: z.string().min(1).max(40).optional(),
  name: z.string().min(1).max(60).optional(),
  tier: z.number().int().min(0).optional(),
  priceMonth: z.string().optional(),
  priceYear: z.string().optional(),
  currency: z.string().min(3).max(3).optional(),
  tagline: z.string().max(120).nullable().optional(),
  description: z.string().max(400).nullable().optional(),
  highlights: z.array(z.string()).optional(),
  popular: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  limits: z.record(z.string(), z.number().int()).optional(),
  entitlements: z.record(z.string(), z.boolean()).optional(),
});
export class PlanUpsertDto extends createZodDto(planUpsertSchema) {}

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
