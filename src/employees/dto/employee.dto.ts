import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  CONTRACT_TYPES,
  CREDENTIAL_STATUSES,
  EMPLOYEE_STATUSES,
  EMPLOYEE_STORE_RELATIONS,
} from '../../database/schema/enums';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .optional();

const storeLink = z.object({
  storeId: z.uuid(),
  relation: z.enum(EMPLOYEE_STORE_RELATIONS).default('secondary'),
});

export const createEmployeeSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: z.email().max(160).optional(),
  phone: z.string().max(40).optional(),
  role: z.string().max(80).optional(),
  department: z.string().max(80).optional(),
  status: z.enum(EMPLOYEE_STATUSES).optional(),
  hireDate: isoDate,
  contractType: z.enum(CONTRACT_TYPES).optional(),
  primaryStoreId: z.uuid().optional(),
  uniqueCode: z.string().min(2).max(40).optional(),
  locale: z.string().max(10).optional(),
  timezone: z.string().max(64).optional(),
  secondaryStores: z.array(storeLink).optional(),
});
export class CreateEmployeeDto extends createZodDto(createEmployeeSchema) {}

export const updateEmployeeSchema = createEmployeeSchema.partial();
export class UpdateEmployeeDto extends createZodDto(updateEmployeeSchema) {}

export const listEmployeesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  storeId: z.uuid().optional(),
  role: z.string().max(80).optional(),
  status: z.enum(EMPLOYEE_STATUSES).optional(),
  q: z.string().max(120).optional(),
});
export class ListEmployeesDto extends createZodDto(listEmployeesSchema) {}

export const inviteEmployeeSchema = z.object({
  email: z.email().max(160).optional(),
  redirectTo: z.url().optional(),
});
export class InviteEmployeeDto extends createZodDto(inviteEmployeeSchema) {}

export const upsertStoreLinkSchema = storeLink.extend({ active: z.boolean().optional() });
export class UpsertStoreLinkDto extends createZodDto(upsertStoreLinkSchema) {}

export const createContractSchema = z.object({
  type: z.enum(CONTRACT_TYPES).default('full_time'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  endDate: isoDate,
  hoursWeek: z.coerce.number().int().min(0).max(168).optional(),
  salary: z.coerce.number().min(0).optional(),
  currency: z.string().length(3).optional(),
  docId: z.uuid().optional(),
});
export class CreateContractDto extends createZodDto(createContractSchema) {}

export const createQualificationSchema = z.object({
  name: z.string().min(1).max(120),
  issuer: z.string().max(120).optional(),
  issued: isoDate,
  expires: isoDate,
  docId: z.uuid().optional(),
  status: z.enum(CREDENTIAL_STATUSES).optional(),
});
export class CreateQualificationDto extends createZodDto(createQualificationSchema) {}

export const createMedicalSchema = z.object({
  type: z.string().min(1).max(120),
  date: isoDate,
  expires: isoDate,
  status: z.enum(CREDENTIAL_STATUSES).optional(),
});
export class CreateMedicalDto extends createZodDto(createMedicalSchema) {}

export const updatePreferencesSchema = z.object({
  availability: z.record(z.string(), z.unknown()).optional(),
  notifPrefs: z.record(z.string(), z.unknown()).optional(),
  uiPrefs: z.record(z.string(), z.unknown()).optional(),
});
export class UpdatePreferencesDto extends createZodDto(updatePreferencesSchema) {}

export const importEmployeesSchema = z.object({
  /** Raw CSV text (header row required: firstName,lastName,email,phone,role,department). */
  csv: z.string().min(1).max(1_000_000),
});
export class ImportEmployeesDto extends createZodDto(importEmployeesSchema) {}
