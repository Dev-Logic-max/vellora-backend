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
  type: z.string().max(60).optional(),
  color: z.string().max(20).optional(),
  icon: z.string().max(40).optional(),
  description: z.string().max(280).optional(),
  defaultStaffing: z.number().int().min(0).optional(),
  activeDays: z.array(z.string()).optional(),
  /** yyyy-MM-dd store-local window the activity applies to. */
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  /** yyyy-MM — one activity per store per month. */
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
});
export class CreateActivityDto extends createZodDto(createActivitySchema) {}

export const updateActivitySchema = createActivitySchema.partial();
export class UpdateActivityDto extends createZodDto(updateActivitySchema) {}

/** Query for listing activities across the company (calendar overlay). */
export const activityQuerySchema = z.object({
  storeId: z.uuid().optional(),
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});
export class ActivityQueryDto extends createZodDto(activityQuerySchema) {}
