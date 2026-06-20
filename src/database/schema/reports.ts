import { relations, sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { reportRunStatusEnum } from './enums';

/** Saved report definition (16-reports §3). `config` holds type + filters. */
export const reportDefs = pgTable(
  'report_defs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: text('type').notNull(),
    config: jsonb('config')
      .notNull()
      .default(sql`'{}'::jsonb`),
    /** Optional cron-ish schedule label ('daily'|'weekly'|'monthly'); null = manual. */
    schedule: text('schedule'),
    recipients: jsonb('recipients')
      .notNull()
      .default(sql`'[]'::jsonb`)
      .$type<string[]>(),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [index('report_defs_company_id_idx').on(table.companyId)],
);

/** A single execution of a report definition (16-reports §3, §8). */
export const reportRuns = pgTable(
  'report_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    reportDefId: uuid('report_def_id')
      .notNull()
      .references(() => reportDefs.id, { onDelete: 'cascade' }),
    status: reportRunStatusEnum('status').notNull().default('queued'),
    /** Private storage object key for the generated file (signed URLs only). */
    outputKey: text('output_key'),
    format: text('format').notNull().default('csv'),
    error: text('error'),
    ranAt: timestamp('ran_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('report_runs_company_id_idx').on(table.companyId),
    index('report_runs_report_def_id_idx').on(table.reportDefId),
  ],
);

export const reportDefsRelations = relations(reportDefs, ({ many }) => ({
  runs: many(reportRuns),
}));

export const reportRunsRelations = relations(reportRuns, ({ one }) => ({
  def: one(reportDefs, { fields: [reportRuns.reportDefId], references: [reportDefs.id] }),
}));

export type ReportDef = typeof reportDefs.$inferSelect;
export type NewReportDef = typeof reportDefs.$inferInsert;
export type ReportRun = typeof reportRuns.$inferSelect;
export type NewReportRun = typeof reportRuns.$inferInsert;
