import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  ANOMALY_STATUSES,
  ATTENDANCE_LOG_STATUSES,
  ATTENDANCE_METHODS,
} from '../../database/schema/enums';

const isoDateTime = z.coerce.date();

export const listLogsSchema = z.object({
  storeId: z.uuid().optional(),
  employeeId: z.uuid().optional(),
  from: isoDateTime.optional(),
  to: isoDateTime.optional(),
  status: z.enum(ATTENDANCE_LOG_STATUSES).optional(),
});
export class ListLogsDto extends createZodDto(listLogsSchema) {}

export const clockInSchema = z.object({
  employeeId: z.uuid(),
  storeId: z.uuid(),
  shiftId: z.uuid().optional(),
  method: z.enum(ATTENDANCE_METHODS).optional(),
  deviceId: z.uuid().optional(),
  terminalId: z.uuid().optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  atUtc: isoDateTime.optional(),
  notes: z.string().max(500).optional(),
});
export class ClockInDto extends createZodDto(clockInSchema) {}

/** Clock-out / break actions target an employee's currently-open log (or an explicit logId). */
export const punchSchema = z.object({
  logId: z.uuid().optional(),
  employeeId: z.uuid().optional(),
  storeId: z.uuid().optional(),
  atUtc: isoDateTime.optional(),
  paid: z.boolean().optional(),
});
export class PunchDto extends createZodDto(punchSchema) {}

const syncEventSchema = z.object({
  kind: z.enum(['clock_in', 'clock_out', 'break_start', 'break_end']),
  employeeId: z.uuid(),
  storeId: z.uuid().optional(),
  shiftId: z.uuid().optional(),
  method: z.enum(ATTENDANCE_METHODS).optional(),
  terminalId: z.uuid().optional(),
  deviceId: z.uuid().optional(),
  atUtc: isoDateTime,
  paid: z.boolean().optional(),
});
export const syncBatchSchema = z.object({
  events: z.array(syncEventSchema).max(500),
});
export class SyncBatchDto extends createZodDto(syncBatchSchema) {}

export const createCorrectionSchema = z.object({
  field: z.enum(['clock_in_utc', 'clock_out_utc', 'status']),
  newValue: z.string().min(1).max(120),
  reason: z.string().max(500).optional(),
});
export class CreateCorrectionDto extends createZodDto(createCorrectionSchema) {}

export const resolveAnomalySchema = z.object({
  status: z.enum(ANOMALY_STATUSES).optional(),
  note: z.string().max(500).optional(),
});
export class ResolveAnomalyDto extends createZodDto(resolveAnomalySchema) {}
