import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { createCompanySchema } from './create-company.dto';

/** Per-company toggles (attendance device-fingerprint enforcement, etc.). */
export const companySettingsSchema = z.object({
  requireDeviceFingerprint: z.boolean().optional(),
});

/** Partial of the create schema; `groupId` reassignment is a Phase 1 concern. */
export const updateCompanySchema = createCompanySchema
  .pick({
    name: true,
    category: true,
    country: true,
    currency: true,
    timezone: true,
    registrationNumber: true,
    companyEmail: true,
    phone: true,
    state: true,
    city: true,
    postalCode: true,
    headOfficeAddress: true,
    offices: true,
    workplaceTypes: true,
  })
  .partial()
  .extend({
    settings: companySettingsSchema.optional(),
    /** Profile imagery (public URLs from the media upload endpoint). */
    logoUrl: z.url().nullish(),
    bannerUrl: z.url().nullish(),
  });

export class UpdateCompanyDto extends createZodDto(updateCompanySchema) {}
