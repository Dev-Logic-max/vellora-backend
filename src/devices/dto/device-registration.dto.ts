import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { DEVICE_REGISTRATION_STATUSES } from '../../database/schema/enums';

/** Employee self-registers the device they're currently on (one-time bind). */
export const registerMyDeviceSchema = z.object({
  /** A short human label (e.g. "Ali's iPhone"). Optional — defaults from UA. */
  label: z.string().max(120).optional(),
  platform: z.string().max(120).optional(),
  userAgent: z.string().max(512).optional(),
  /** Optional browser fingerprint (visitorId). Only checked when the company
   * enables fingerprint enforcement. */
  fingerprint: z.string().max(256).optional(),
  /** Existing device token from localStorage, if the device re-presents one. */
  deviceToken: z.string().max(128).optional(),
});
export class RegisterMyDeviceDto extends createZodDto(registerMyDeviceSchema) {}

/** HR/admin manage an employee's registration. */
export const listRegistrationsSchema = z.object({
  employeeId: z.uuid().optional(),
  storeId: z.uuid().optional(),
  status: z.enum(DEVICE_REGISTRATION_STATUSES).optional(),
  q: z.string().max(120).optional(),
});
export class ListRegistrationsDto extends createZodDto(listRegistrationsSchema) {}

/** HR/admin register a device on behalf of an employee (rare; e.g. in person). */
export const adminRegisterSchema = z.object({
  employeeId: z.uuid(),
  label: z.string().max(120).optional(),
  platform: z.string().max(120).optional(),
});
export class AdminRegisterDto extends createZodDto(adminRegisterSchema) {}
