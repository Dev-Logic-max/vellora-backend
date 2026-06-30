import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { SHIFT_SOURCES, SHIFT_STATUSES } from '../../database/schema/enums';

/**
 * ISO datetime input → Date. Modeled as a string so it is representable in
 * OpenAPI JSON Schema (zod v4 cannot serialize a raw z.date()), while the
 * service layer still receives a Date.
 */
const isoDateTime = z
  .string()
  .datetime({ offset: true })
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
  .transform((s) => new Date(s));
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const listShiftsSchema = z.object({
  storeId: z.uuid().optional(),
  from: isoDateTime.optional(),
  to: isoDateTime.optional(),
  status: z.enum(SHIFT_STATUSES).optional(),
  role: z.string().max(80).optional(),
  employeeId: z.uuid().optional(),
});
export class ListShiftsDto extends createZodDto(listShiftsSchema) {}

export const createShiftSchema = z
  .object({
    storeId: z.uuid(),
    // `nullish` so the client may send explicit nulls (unassigned shift / off-day
    // with no employee, no role, no notes) without tripping validation.
    employeeId: z.uuid().nullish(),
    activityId: z.uuid().nullish(),
    role: z.string().max(80).nullish(),
    startsAtUtc: isoDateTime,
    endsAtUtc: isoDateTime,
    breakMinutes: z.coerce.number().int().min(0).max(600).optional(),
    notes: z.string().max(500).nullish(),
    status: z.enum(SHIFT_STATUSES).optional(),
    source: z.enum(SHIFT_SOURCES).optional(),
  })
  .refine((v) => v.endsAtUtc > v.startsAtUtc, {
    message: 'End must be after start',
    path: ['endsAtUtc'],
  });
export class CreateShiftDto extends createZodDto(createShiftSchema) {}

export const updateShiftSchema = z.object({
  employeeId: z.uuid().nullish(),
  activityId: z.uuid().nullish(),
  role: z.string().max(80).nullish(),
  startsAtUtc: isoDateTime.optional(),
  endsAtUtc: isoDateTime.optional(),
  breakMinutes: z.coerce.number().int().min(0).max(600).optional(),
  notes: z.string().max(500).nullish(),
  status: z.enum(SHIFT_STATUSES).optional(),
});
export class UpdateShiftDto extends createZodDto(updateShiftSchema) {}

export const assignShiftSchema = z.object({
  employeeId: z.uuid().nullable(),
});
export class AssignShiftDto extends createZodDto(assignShiftSchema) {}

export const publishShiftsSchema = z.object({
  storeId: z.uuid(),
  from: isoDateTime,
  to: isoDateTime,
});
export class PublishShiftsDto extends createZodDto(publishShiftsSchema) {}

export const createTemplateSchema = z.object({
  name: z.string().min(1).max(120),
  storeId: z.uuid().optional(),
  pattern: z.record(z.string(), z.unknown()).optional(),
  active: z.boolean().optional(),
});
export class CreateTemplateDto extends createZodDto(createTemplateSchema) {}

export const applyTemplateSchema = z.object({
  storeId: z.uuid(),
  weekStart: ymd,
});
export class ApplyTemplateDto extends createZodDto(applyTemplateSchema) {}

export const copyWeekSchema = z.object({
  storeId: z.uuid(),
  fromWeekStart: ymd,
  toWeekStart: ymd,
});
export class CopyWeekDto extends createZodDto(copyWeekSchema) {}

export const coverageQuerySchema = z.object({
  storeId: z.uuid(),
  from: ymd,
  to: ymd,
});
export class CoverageQueryDto extends createZodDto(coverageQuerySchema) {}

export const setCoverageTargetsSchema = z.object({
  storeId: z.uuid(),
  targets: z
    .array(
      z.object({
        weekday: z.coerce.number().int().min(0).max(6),
        hour: z.coerce.number().int().min(0).max(23),
        requiredStaff: z.coerce.number().int().min(0).max(999),
      }),
    )
    .max(500),
});
export class SetCoverageTargetsDto extends createZodDto(setCoverageTargetsSchema) {}
