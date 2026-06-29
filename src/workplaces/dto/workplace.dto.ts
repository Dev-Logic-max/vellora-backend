import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/** Shared location/profile fields for offices + factories (mirrors stores). */
const baseWorkplace = {
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
  logoUrl: z.string().url().max(500).nullable().optional(),
  bannerUrl: z.string().url().max(500).nullable().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
};

// ── Offices ──────────────────────────────────────────────────────────────────
export const createOfficeSchema = z.object({
  ...baseWorkplace,
  headOffice: z.boolean().optional(),
  floors: z.coerce.number().int().min(0).optional(),
  desks: z.coerce.number().int().min(0).optional(),
  meetingRooms: z.coerce.number().int().min(0).optional(),
  departments: z.array(z.string().max(60)).optional(),
});
export class CreateOfficeDto extends createZodDto(createOfficeSchema) {}
export const updateOfficeSchema = createOfficeSchema.partial();
export class UpdateOfficeDto extends createZodDto(updateOfficeSchema) {}

// ── Factories ────────────────────────────────────────────────────────────────
export const createFactorySchema = z.object({
  ...baseWorkplace,
  headFactory: z.boolean().optional(),
  productionLines: z.coerce.number().int().min(0).optional(),
  dailyOutput: z.coerce.number().int().min(0).optional(),
  shiftModel: z.coerce.number().int().min(1).max(3).optional(),
  safetyLevel: z.enum(['low', 'medium', 'high']).optional(),
  machineCount: z.coerce.number().int().min(0).optional(),
});
export class CreateFactoryDto extends createZodDto(createFactorySchema) {}
export const updateFactorySchema = createFactorySchema.partial();
export class UpdateFactoryDto extends createZodDto(updateFactorySchema) {}
