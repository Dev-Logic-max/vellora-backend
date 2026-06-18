import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { LEAVE_REQUEST_STATUSES } from '../../database/schema/enums';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

// ── leave types (policies) ───────────────────────────────────────────────────
export const createLeaveTypeSchema = z.object({
  name: z.string().min(1).max(80),
  paid: z.boolean().optional(),
  color: z.string().max(20).optional(),
  requiresChain: z.boolean().optional(),
  accrualRule: z.record(z.string(), z.unknown()).optional(),
  carryoverRule: z.record(z.string(), z.unknown()).optional(),
  maxPerYear: z.coerce.number().int().min(0).max(366).optional(),
  active: z.boolean().optional(),
});
export class CreateLeaveTypeDto extends createZodDto(createLeaveTypeSchema) {}

export const updateLeaveTypeSchema = createLeaveTypeSchema.partial();
export class UpdateLeaveTypeDto extends createZodDto(updateLeaveTypeSchema) {}

// ── requests ─────────────────────────────────────────────────────────────────
export const listRequestsSchema = z.object({
  employeeId: z.uuid().optional(),
  status: z.enum(LEAVE_REQUEST_STATUSES).optional(),
  mine: z.coerce.boolean().optional(),
});
export class ListRequestsDto extends createZodDto(listRequestsSchema) {}

export const createRequestSchema = z
  .object({
    employeeId: z.uuid(),
    typeId: z.uuid(),
    startDate: isoDate,
    endDate: isoDate,
    halfDay: z.boolean().optional(),
    reason: z.string().max(500).optional(),
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: 'endDate must be on or after startDate',
    path: ['endDate'],
  });
export class CreateRequestDto extends createZodDto(createRequestSchema) {}

export const decisionSchema = z.object({
  note: z.string().max(500).optional(),
});
export class DecisionDto extends createZodDto(decisionSchema) {}

// ── balances ─────────────────────────────────────────────────────────────────
export const listBalancesSchema = z.object({
  employeeId: z.uuid().optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});
export class ListBalancesDto extends createZodDto(listBalancesSchema) {}

export const setBalanceSchema = z.object({
  employeeId: z.uuid(),
  typeId: z.uuid(),
  year: z.coerce.number().int().min(2000).max(2100),
  entitled: z.coerce.number().min(0).max(366),
});
export class SetBalanceDto extends createZodDto(setBalanceSchema) {}

// ── holidays + blackout ──────────────────────────────────────────────────────
export const listHolidaysSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  storeId: z.uuid().optional(),
});
export class ListHolidaysDto extends createZodDto(listHolidaysSchema) {}

export const createHolidaySchema = z.object({
  storeId: z.uuid().optional(),
  country: z.string().max(2).optional(),
  date: isoDate,
  name: z.string().min(1).max(120),
  recurring: z.boolean().optional(),
});
export class CreateHolidayDto extends createZodDto(createHolidaySchema) {}

export const createBlackoutSchema = z
  .object({
    storeId: z.uuid().optional(),
    startDate: isoDate,
    endDate: isoDate,
    reason: z.string().max(200).optional(),
  })
  .refine((v) => v.endDate >= v.startDate, { path: ['endDate'] });
export class CreateBlackoutDto extends createZodDto(createBlackoutSchema) {}
