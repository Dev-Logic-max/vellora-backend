import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  ANOMALY_STATUSES,
  ATTENDANCE_LOG_STATUSES,
  ATTENDANCE_METHODS,
} from '../../database/schema/enums';

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

/**
 * A QR-scan punch from the kiosk flow (point 19). The signed-in employee scans
 * a terminal QR, the app validates the token + their registered device, then
 * performs the action. The employee is resolved from the auth token (never the
 * client) so no one can punch for someone else.
 */
export const kioskPunchSchema = z.object({
  /** base64url(terminalId:secret) from the scanned QR. */
  token: z.string().min(8).max(512),
  action: z.enum(['clock_in', 'clock_out', 'break_start', 'break_end']),
  /** Device token persisted on this device at registration (primary identity). */
  deviceToken: z.string().max(128).optional(),
  /** Optional fingerprint — only checked when the company enables it. */
  fingerprint: z.string().max(256).optional(),
});
export class KioskPunchDto extends createZodDto(kioskPunchSchema) {}

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
