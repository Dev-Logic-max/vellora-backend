import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const screenerQuestionSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().min(1).max(200),
  required: z.boolean().default(false),
});

// ── jobs ───────────────────────────────────────────────────────────────────
export const createJobSchema = z.object({
  title: z.string().min(1).max(160),
  description: z.string().max(20_000).default(''),
  storeId: z.uuid().optional(),
  employmentType: z
    .enum(['full_time', 'part_time', 'temporary', 'contractor', 'intern'])
    .default('full_time'),
  location: z.string().max(200).optional(),
  screenerQuestions: z.array(screenerQuestionSchema).max(20).default([]),
});
export class CreateJobDto extends createZodDto(createJobSchema) {}

export const updateJobSchema = createJobSchema.partial();
export class UpdateJobDto extends createZodDto(updateJobSchema) {}

// ── candidates (internal) ────────────────────────────────────────────────────
export const moveCandidateSchema = z.object({
  stage: z.enum(['applied', 'review', 'interview', 'offer', 'hired', 'rejected']),
});
export class MoveCandidateDto extends createZodDto(moveCandidateSchema) {}

export const updateCandidateSchema = z.object({
  notes: z.string().max(10_000).optional(),
  score: z.number().int().min(0).max(100).optional(),
});
export class UpdateCandidateDto extends createZodDto(updateCandidateSchema) {}

// ── interviews ───────────────────────────────────────────────────────────────
export const scheduleInterviewSchema = z.object({
  candidateId: z.uuid(),
  /** ISO-8601 UTC instant. */
  scheduledAt: z.string().datetime(),
  durationMins: z.number().int().min(5).max(480).default(30),
  mode: z.enum(['onsite', 'phone', 'video']).default('video'),
  location: z.string().max(300).optional(),
  interviewers: z.array(z.email()).max(20).default([]),
});
export class ScheduleInterviewDto extends createZodDto(scheduleInterviewSchema) {}

// ── public apply (unauthenticated) ───────────────────────────────────────────
export const requestResumeUploadSchema = z.object({
  filename: z.string().min(1).max(200),
});
export class RequestResumeUploadDto extends createZodDto(requestResumeUploadSchema) {}

export const applySchema = z.object({
  name: z.string().min(1).max(160),
  email: z.email(),
  phone: z.string().max(40).optional(),
  /** Storage key returned by the resume-upload step. */
  resumeKey: z.string().max(400).optional(),
  answers: z.record(z.string(), z.string().max(2000)).optional(),
  /** GDPR consent — must be true to store the application. */
  consent: z.literal(true),
});
export class ApplyDto extends createZodDto(applySchema) {}
