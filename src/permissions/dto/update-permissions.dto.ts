import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { MEMBERSHIP_ROLES } from '../../database/schema/enums';

export const updatePermissionsSchema = z.object({
  entries: z
    .array(
      z.object({
        role: z.enum(MEMBERSHIP_ROLES),
        resource: z.string().min(1),
        action: z.string().min(1).optional(),
        allowed: z.boolean(),
      }),
    )
    .min(1),
});

export class UpdatePermissionsDto extends createZodDto(updatePermissionsSchema) {}

export const updateModuleVisibilitySchema = z.object({
  entries: z
    .array(
      z.object({
        role: z.enum(MEMBERSHIP_ROLES),
        moduleKey: z.string().min(1),
        visible: z.boolean(),
      }),
    )
    .min(1),
});

export class UpdateModuleVisibilityDto extends createZodDto(updateModuleVisibilitySchema) {}
