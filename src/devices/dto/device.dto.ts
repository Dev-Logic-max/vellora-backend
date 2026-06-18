import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { DEVICE_STATUSES } from '../../database/schema/enums';

export const listDevicesSchema = z.object({
  storeId: z.uuid().optional(),
  employeeId: z.uuid().optional(),
  status: z.enum(DEVICE_STATUSES).optional(),
  q: z.string().max(120).optional(),
});
export class ListDevicesDto extends createZodDto(listDevicesSchema) {}

export const registerDeviceSchema = z.object({
  employeeId: z.uuid(),
  label: z.string().min(1).max(120),
  platform: z.string().max(60).optional(),
  boundHint: z.string().max(200).optional(),
});
export class RegisterDeviceDto extends createZodDto(registerDeviceSchema) {}

export const createTerminalSchema = z.object({
  storeId: z.uuid(),
  label: z.string().min(1).max(120),
});
export class CreateTerminalDto extends createZodDto(createTerminalSchema) {}
