import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const createCompanySchema = z.object({
  name: z.string().min(2).max(120),
  /** ISO-3166 alpha-2 (e.g. "US", "GB"). Defaults to "US" if omitted. */
  country: z.string().length(2).optional(),
  /** ISO-4217 (e.g. "USD", "EUR"). Defaults to "USD" if omitted. */
  currency: z.string().length(3).optional(),
  /** IANA timezone (e.g. "Europe/London"). Defaults to "UTC" if omitted. */
  timezone: z.string().min(1).max(64).optional(),
  groupId: z.uuid().optional(),
});

export class CreateCompanyDto extends createZodDto(createCompanySchema) {}
