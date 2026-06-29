import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/** A single office/location entry stored in `companies.offices` (jsonb array). */
export const officeSchema = z.object({
  label: z.string().max(80).optional(),
  city: z.string().max(80).optional(),
  country: z.string().max(80).optional(),
  address: z.string().max(240).optional(),
});

/** Custom per-company pricing — only meaningful when the chosen plan is "custom". */
export const customPricingSchema = z.object({
  pricePerEmployee: z.coerce.number().min(0).optional(),
  pricePerDevice: z.coerce.number().min(0).optional(),
  extraStoragePricePerGb: z.coerce.number().min(0).optional(),
  storageLimitGb: z.coerce.number().int().min(0).optional(),
  storageFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
    .optional(),
  storageTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
    .optional(),
  discountPct: z.coerce.number().min(0).max(100).optional(),
  discountFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
    .optional(),
  discountTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
    .optional(),
});
export type CustomPricing = z.infer<typeof customPricingSchema>;

export const createCompanySchema = z.object({
  name: z.string().min(2).max(120),
  /** ISO-3166 alpha-2 (e.g. "US", "GB"). Defaults to "US" if omitted. */
  country: z.string().length(2).optional(),
  /** ISO-4217 (e.g. "USD", "EUR"). Defaults to "USD" if omitted. */
  currency: z.string().length(3).optional(),
  /** IANA timezone (e.g. "Europe/London"). Defaults to "UTC" if omitted. */
  timezone: z.string().min(1).max(64).optional(),
  groupId: z.uuid().optional(),
  /** Owner/chairman; defaults to the creating user when omitted. */
  ownerUserId: z.uuid().optional(),
  /** Industry/category (retail, hospitality, …). */
  category: z.string().max(40).optional(),
  registrationNumber: z.string().max(80).optional(),
  companyEmail: z.email().max(160).optional().or(z.literal('')),
  phone: z.string().max(40).optional(),
  state: z.string().max(80).optional(),
  city: z.string().max(80).optional(),
  postalCode: z.string().max(20).optional(),
  headOfficeAddress: z.string().max(240).optional(),
  offices: z.array(officeSchema).optional(),
  /** Workplace kinds the company operates: 'stores' | 'offices' | 'factories'. */
  workplaceTypes: z.array(z.enum(['stores', 'offices', 'factories'])).optional(),
  /** Plan key chosen at creation (e.g. "free"/"growth"/"custom"). */
  planKey: z.string().max(40).optional(),
  /** Present (and persisted to the entitlement override + discounts) when planKey === "custom". */
  customPricing: customPricingSchema.optional(),
});

export class CreateCompanyDto extends createZodDto(createCompanySchema) {}
