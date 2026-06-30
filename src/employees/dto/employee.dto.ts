import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  CONTRACT_TYPES,
  CREDENTIAL_STATUSES,
  EMPLOYEE_STATUSES,
  EMPLOYEE_STORE_RELATIONS,
  MEMBERSHIP_ROLES,
} from '../../database/schema/enums';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .optional();

const storeLink = z.object({
  storeId: z.uuid(),
  relation: z.enum(EMPLOYEE_STORE_RELATIONS).default('secondary'),
});

const WORK_SCHEDULE_TYPES = ['full_time', 'part_time', 'shift', 'flexible', 'remote'] as const;

export const createEmployeeSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: z.email().max(160).optional(),
  phone: z.string().max(40).optional(),
  companyEmail: z.email().max(160).optional().or(z.literal('')),
  /** @deprecated job title — use `jobTitle`. Kept for back-compat. */
  role: z.string().max(80).optional(),
  /** The person's JOB title (free text). The platform ROLE is `membershipRole`. */
  jobTitle: z.string().max(80).optional(),
  department: z.string().max(80).optional(),
  supervisorId: z.uuid().optional(),
  status: z.enum(EMPLOYEE_STATUSES).optional(),
  hireDate: isoDate,
  contractType: z.enum(CONTRACT_TYPES).optional(),
  workScheduleType: z.enum(WORK_SCHEDULE_TYPES).optional(),
  weeklyHours: z.coerce.number().int().min(0).max(168).optional(),
  contractEnd: isoDate,
  // ── personal ──────────────────────────────────────────────────────────
  nationality: z.string().max(80).optional(),
  dateOfBirth: isoDate,
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']).optional(),
  maritalStatus: z.enum(['single', 'married', 'divorced', 'widowed', 'other']).optional(),
  idCardNumber: z.string().max(60).optional(),
  iban: z.string().max(40).optional(),
  // ── address ───────────────────────────────────────────────────────────
  country: z.string().max(80).optional(),
  state: z.string().max(80).optional(),
  city: z.string().max(80).optional(),
  postalCode: z.string().max(20).optional(),
  address: z.string().max(240).optional(),
  /** Map of offered benefits, e.g. { first_aid: true, medical: true, ... }. */
  benefits: z.record(z.string(), z.boolean()).optional(),
  /** Profile photo URL (public bucket); null to remove. */
  avatarUrl: z.string().max(1000).nullable().optional(),
  primaryStoreId: z.uuid().optional(),
  uniqueCode: z.string().min(2).max(40).optional(),
  locale: z.string().max(10).optional(),
  timezone: z.string().max(64).optional(),
  secondaryStores: z.array(storeLink).optional(),
  // ── platform login (optional) ─────────────────────────────────────────────
  /** When set, provision a portal login + a PENDING company membership of this
   * role and raise an activation request (HR/admin must approve). The creator
   * may only assign a role strictly BELOW their own (enforced in the service). */
  membershipRole: z.enum(MEMBERSHIP_ROLES).optional(),
  /** Email for the provisioned login (defaults to `email` when omitted). */
  accountEmail: z.email().max(160).optional(),
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

/** Stored contract states. `expired` is DERIVED on read (active + past end date),
 * never persisted, so it isn't accepted as an input status. */
export const CONTRACT_INPUT_STATUSES = ['draft', 'active', 'cancelled'] as const;

export const createContractSchema = z.object({
  title: z.string().max(120).optional(),
  type: z.enum(CONTRACT_TYPES).default('full_time'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  endDate: isoDate,
  hoursWeek: z.coerce.number().int().min(0).max(168).optional(),
  salary: z.coerce.number().min(0).optional(),
  currency: z.string().length(3).optional(),
  docId: z.uuid().optional(),
  /** Defaults to 'active' in the service when omitted. A draft can later be activated. */
  status: z.enum(CONTRACT_INPUT_STATUSES).optional(),
});
export class CreateContractDto extends createZodDto(createContractSchema) {}

/** Update a contract in place — any subset of fields, optionally its status. */
export const updateContractSchema = z.object({
  title: z.string().max(120).optional(),
  type: z.enum(CONTRACT_TYPES).optional(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
    .nullable()
    .optional(),
  hoursWeek: z.coerce.number().int().min(0).max(168).optional(),
  salary: z.coerce.number().min(0).optional(),
  currency: z.string().length(3).optional(),
  status: z.enum(CONTRACT_INPUT_STATUSES).optional(),
});
export class UpdateContractDto extends createZodDto(updateContractSchema) {}

/** Extend a contract — push (or clear) its end date. */
export const extendContractSchema = z.object({
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
    .nullable(),
});
export class ExtendContractDto extends createZodDto(extendContractSchema) {}

/** Cancel a contract — keeps the row (cancelled) until permanently deleted. */
export const cancelContractSchema = z.object({
  reason: z.string().max(240).optional(),
});
export class CancelContractDto extends createZodDto(cancelContractSchema) {}

// ── activation requests ─────────────────────────────────────────────────────
export const listActivationRequestsSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
});
export class ListActivationRequestsDto extends createZodDto(listActivationRequestsSchema) {}

export const rejectActivationSchema = z.object({
  reason: z.string().max(240).optional(),
});
export class RejectActivationDto extends createZodDto(rejectActivationSchema) {}

export const approveActivationSchema = z.object({
  redirectTo: z.url().optional(),
});
export class ApproveActivationDto extends createZodDto(approveActivationSchema) {}

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

export const createBankAccountSchema = z.object({
  label: z.string().max(60).optional(),
  country: z.string().max(2).optional(),
  bankName: z.string().min(1).max(120),
  bankSwift: z.string().max(11).optional(),
  bankBrandColor: z.string().max(16).optional(),
  accountHolder: z.string().max(120).optional(),
  iban: z.string().max(40).optional(),
  accountNumber: z.string().max(40).optional(),
  currency: z.string().max(3).optional(),
  cardNetwork: z
    .enum(['visa', 'mastercard', 'amex', 'discover', 'unionpay', 'maestro', 'other'])
    .optional(),
  cardLast4: z.string().max(4).optional(),
  isPrimary: z.boolean().optional(),
});
export class CreateBankAccountDto extends createZodDto(createBankAccountSchema) {}

export const updateBankAccountSchema = createBankAccountSchema.partial();
export class UpdateBankAccountDto extends createZodDto(updateBankAccountSchema) {}

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
