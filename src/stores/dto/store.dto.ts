import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/** Per-store operational toggles (mirrors stores.settings jsonb). */
export const storeSettingsSchema = z
  .object({
    posEnabled: z.boolean().optional(),
    publicProfile: z.boolean().optional(),
    peakAlerts: z.boolean().optional(),
    currency: z.string().max(3).optional(),
    monthlyTarget: z.coerce.number().min(0).optional(),
  })
  .partial();

export const createStoreSchema = z.object({
  name: z.string().min(2).max(120),
  code: z.string().max(40).optional(),
  category: z.string().max(60).optional(),
  country: z.string().length(2).optional(),
  state: z.string().max(80).optional(),
  city: z.string().max(80).optional(),
  address: z.string().max(240).optional(),
  postalCode: z.string().max(20).optional(),
  timezone: z.string().min(1).max(64).optional(),
  capacity: z.coerce.number().int().min(0).optional(),
  headStore: z.boolean().optional(),
  managerUserId: z.uuid().optional(),
  logoUrl: z.string().url().max(500).optional(),
  bannerUrl: z.string().url().max(500).optional(),
  settings: storeSettingsSchema.optional(),
});
export class CreateStoreDto extends createZodDto(createStoreSchema) {}

export const updateStoreSchema = createStoreSchema.partial();
export class UpdateStoreDto extends createZodDto(updateStoreSchema) {}

export const updateHoursSchema = z.object({
  openingHours: z.record(z.string(), z.unknown()),
});
export class UpdateHoursDto extends createZodDto(updateHoursSchema) {}

export const createActivitySchema = z.object({
  name: z.string().min(1).max(80),
  color: z.string().max(20).optional(),
  defaultStaffing: z.number().int().min(0).optional(),
  activeDays: z.array(z.string()).optional(),
});
export class CreateActivityDto extends createZodDto(createActivitySchema) {}
