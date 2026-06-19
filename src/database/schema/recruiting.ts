import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { stores } from './stores';
import { users } from './users';
import { candidateStageEnum, interviewModeEnum, interviewStatusEnum, jobStatusEnum } from './enums';

/** A single screener question shown on the public application form. */
export interface ScreenerQuestion {
  id: string;
  label: string;
  required: boolean;
}

/** Job posting (09-recruiting §3). `slug` is unique per company for careers URLs. */
export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id').references(() => stores.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    description: text('description').notNull().default(''),
    employmentType: text('employment_type').notNull().default('full_time'),
    location: text('location'),
    status: jobStatusEnum('status').notNull().default('draft'),
    published: boolean('published').notNull().default(false),
    screenerQuestions: jsonb('screener_questions')
      .notNull()
      .default(sql`'[]'::jsonb`)
      .$type<ScreenerQuestion[]>(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique('jobs_company_slug_unique').on(table.companyId, table.slug),
    index('jobs_company_id_idx').on(table.companyId),
    index('jobs_status_idx').on(table.status),
  ],
);

/** Parsed resume fields (Gemini) — loosely typed; produced by the AI hook. */
export interface ParsedResume {
  summary?: string;
  skills?: string[];
  experienceYears?: number;
  education?: string;
  [key: string]: unknown;
}

/** Candidate / application (09-recruiting §3). Created by the public apply flow. */
export const candidates = pgTable(
  'candidates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    email: text('email').notNull(),
    phone: text('phone'),
    /** Private storage object key for the uploaded resume (signed URLs only). */
    resumeKey: text('resume_key'),
    parsed: jsonb('parsed').$type<ParsedResume>(),
    /** AI score vs the job (0–100), null until scored. */
    score: integer('score'),
    stage: candidateStageEnum('stage').notNull().default('applied'),
    source: text('source').notNull().default('careers'),
    notes: text('notes'),
    /** Screener answers captured at apply time. */
    answers: jsonb('answers').default(sql`'{}'::jsonb`),
    /** GDPR consent timestamp (careers data) — required to store the application. */
    consentAt: timestamp('consent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('candidates_company_id_idx').on(table.companyId),
    index('candidates_job_id_idx').on(table.jobId),
    index('candidates_stage_idx').on(table.stage),
  ],
);

/** Interview (09-recruiting §3). Slot stored UTC; ICS generated on read. */
export const interviews = pgTable(
  'interviews',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    candidateId: uuid('candidate_id')
      .notNull()
      .references(() => candidates.id, { onDelete: 'cascade' }),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    durationMins: integer('duration_mins').notNull().default(30),
    mode: interviewModeEnum('mode').notNull().default('video'),
    location: text('location'),
    interviewers: jsonb('interviewers')
      .default(sql`'[]'::jsonb`)
      .$type<string[]>(),
    icsUid: text('ics_uid').notNull(),
    status: interviewStatusEnum('status').notNull().default('scheduled'),
    feedback: text('feedback'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('interviews_company_id_idx').on(table.companyId),
    index('interviews_candidate_id_idx').on(table.candidateId),
  ],
);

export const jobsRelations = relations(jobs, ({ many }) => ({
  candidates: many(candidates),
}));

export const candidatesRelations = relations(candidates, ({ one, many }) => ({
  job: one(jobs, { fields: [candidates.jobId], references: [jobs.id] }),
  interviews: many(interviews),
}));

export const interviewsRelations = relations(interviews, ({ one }) => ({
  candidate: one(candidates, {
    fields: [interviews.candidateId],
    references: [candidates.id],
  }),
}));

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type Candidate = typeof candidates.$inferSelect;
export type NewCandidate = typeof candidates.$inferInsert;
export type Interview = typeof interviews.$inferSelect;
export type NewInterview = typeof interviews.$inferInsert;
