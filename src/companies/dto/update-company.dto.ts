import { createZodDto } from 'nestjs-zod';
import { createCompanySchema } from './create-company.dto';

/** Partial of the create schema; `groupId` reassignment is a Phase 1 concern. */
export const updateCompanySchema = createCompanySchema
  .pick({ name: true, country: true, currency: true, timezone: true })
  .partial();

export class UpdateCompanyDto extends createZodDto(updateCompanySchema) {}
