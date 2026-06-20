import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const REPORT_TYPES = ['headcount', 'attendance', 'turnover', 'labor'] as const;

/** Shared filter shape for dashboard aggregates + saved defs. */
export const reportFiltersSchema = z.object({
  /** ISO dates (inclusive). Defaults applied server-side when omitted. */
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  storeId: z.uuid().optional(),
});
export class ReportFiltersDto extends createZodDto(reportFiltersSchema) {}

export const createReportDefSchema = z.object({
  name: z.string().min(1).max(160),
  type: z.enum(REPORT_TYPES),
  config: reportFiltersSchema.default({}),
  schedule: z.enum(['daily', 'weekly', 'monthly']).optional(),
  recipients: z.array(z.email()).max(50).default([]),
});
export class CreateReportDefDto extends createZodDto(createReportDefSchema) {}

export const runReportSchema = z.object({
  format: z.enum(['csv']).default('csv'),
});
export class RunReportDto extends createZodDto(runReportSchema) {}

export const insightsSchema = z.object({
  storeId: z.uuid().optional(),
});
export class InsightsDto extends createZodDto(insightsSchema) {}
