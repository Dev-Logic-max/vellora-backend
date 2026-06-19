import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { GeminiService } from '../ai/gemini.service';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import type { Candidate, Interview, Job } from '../database/schema';
import { MailerService } from '../infra/mailer.service';
import { QueueService } from '../infra/queue.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StorageService } from '../infra/storage.service';
import { buildIcs } from './ics';
import { RecruitingRepository } from './recruiting.repository';
import type {
  ApplyDto,
  CreateJobDto,
  MoveCandidateDto,
  ScheduleInterviewDto,
  UpdateCandidateDto,
  UpdateJobDto,
} from './dto/recruiting.dto';

export const RECRUITING_QUEUE = 'recruiting';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
}

/**
 * Recruiting / ATS (09-recruiting). Internal job/candidate/interview management
 * plus the public careers flow (tenant resolved by slug, then RLS-scoped).
 * Heavy/side-channel work (interview email + ICS) goes through BullMQ.
 */
@Injectable()
export class RecruitingService {
  constructor(
    private readonly repo: RecruitingRepository,
    private readonly tenant: TenantContextService,
    private readonly storage: StorageService,
    private readonly queue: QueueService,
    private readonly mailer: MailerService,
    private readonly notifications: NotificationsService,
    private readonly gemini: GeminiService,
  ) {
    // Worker: deliver the interview invite (ICS body) to interviewers.
    this.queue.register(RECRUITING_QUEUE, async (job) => {
      if (job.name === 'interview-invite') {
        const data = job.data as { to: string[]; subject: string; body: string };
        if (data.to.length) {
          await this.mailer.send({ to: data.to, subject: data.subject, body: data.body });
        }
      }
    });
  }

  private userId(): string | undefined {
    return this.tenant.get()?.user.userId;
  }

  // ── jobs ────────────────────────────────────────────────────────────────────
  listJobs(companyId: string): Promise<Job[]> {
    return this.repo.listJobs(companyId);
  }

  async getJob(companyId: string, id: string): Promise<Job> {
    const job = await this.repo.getJob(companyId, id);
    if (!job) throw new NotFoundException('Job not found.');
    return job;
  }

  async createJob(companyId: string, dto: CreateJobDto): Promise<Job> {
    const slug = await this.uniqueJobSlug(companyId, dto.title);
    return this.repo.createJob(companyId, {
      companyId,
      title: dto.title,
      slug,
      description: dto.description,
      storeId: dto.storeId,
      employmentType: dto.employmentType,
      location: dto.location,
      screenerQuestions: dto.screenerQuestions,
      createdBy: this.userId(),
    });
  }

  async updateJob(companyId: string, id: string, dto: UpdateJobDto): Promise<Job> {
    await this.getJob(companyId, id);
    const updated = await this.repo.updateJob(companyId, id, dto);
    if (!updated) throw new NotFoundException('Job not found.');
    return updated;
  }

  async setPublished(companyId: string, id: string, published: boolean): Promise<Job> {
    await this.getJob(companyId, id);
    const updated = await this.repo.updateJob(companyId, id, {
      published,
      status: published ? 'published' : 'draft',
    });
    if (!updated) throw new NotFoundException('Job not found.');
    return updated;
  }

  private async uniqueJobSlug(companyId: string, title: string): Promise<string> {
    const base = slugify(title) || 'job';
    let slug = base;
    let n = 1;
    while (await this.repo.slugExists(companyId, slug)) {
      slug = `${base}-${++n}`;
    }
    return slug;
  }

  // ── candidates ────────────────────────────────────────────────────────────────
  listCandidates(companyId: string, jobId?: string): Promise<Candidate[]> {
    return this.repo.listCandidates(companyId, jobId);
  }

  async getCandidate(companyId: string, id: string): Promise<Candidate> {
    const candidate = await this.repo.getCandidate(companyId, id);
    if (!candidate) throw new NotFoundException('Candidate not found.');
    return candidate;
  }

  async moveCandidate(companyId: string, id: string, dto: MoveCandidateDto): Promise<Candidate> {
    await this.getCandidate(companyId, id);
    const updated = await this.repo.updateCandidate(companyId, id, { stage: dto.stage });
    if (!updated) throw new NotFoundException('Candidate not found.');
    return updated;
  }

  async updateCandidate(
    companyId: string,
    id: string,
    dto: UpdateCandidateDto,
  ): Promise<Candidate> {
    await this.getCandidate(companyId, id);
    const updated = await this.repo.updateCandidate(companyId, id, dto);
    if (!updated) throw new NotFoundException('Candidate not found.');
    return updated;
  }

  /** Short-lived signed URL to read a candidate's resume (permission-checked). */
  async resumeUrl(companyId: string, id: string): Promise<{ url: string | null }> {
    const candidate = await this.getCandidate(companyId, id);
    if (!candidate.resumeKey) return { url: null };
    return { url: await this.storage.createSignedDownload(candidate.resumeKey) };
  }

  // ── AI hooks (Gemini; stub until P9-C key) ──────────────────────────────────
  async scoreCandidate(companyId: string, id: string): Promise<Candidate> {
    const candidate = await this.getCandidate(companyId, id);
    const job = await this.repo.getJob(companyId, candidate.jobId);
    const { score } = await this.gemini.scoreCandidate(
      job?.description ?? '',
      JSON.stringify(candidate.parsed ?? { name: candidate.name }),
    );
    const updated = await this.repo.updateCandidate(companyId, id, { score });
    if (!updated) throw new NotFoundException('Candidate not found.');
    return updated;
  }

  async draftJobDescription(input: { title: string; notes?: string }): Promise<{ text: string }> {
    return { text: await this.gemini.draftJobDescription(input) };
  }

  // ── interviews ───────────────────────────────────────────────────────────────
  async scheduleInterview(companyId: string, dto: ScheduleInterviewDto): Promise<Interview> {
    const candidate = await this.getCandidate(companyId, dto.candidateId);
    const icsUid = `${randomUUID()}@vellora`;
    const interview = await this.repo.createInterview(companyId, {
      companyId,
      candidateId: dto.candidateId,
      scheduledAt: new Date(dto.scheduledAt),
      durationMins: dto.durationMins,
      mode: dto.mode,
      location: dto.location,
      interviewers: dto.interviewers,
      icsUid,
    });

    // Queue the invite email with the ICS body to the interviewers + candidate.
    const ics = this.icsFor(interview, candidate);
    await this.queue.enqueue(RECRUITING_QUEUE, 'interview-invite', {
      to: Array.from(new Set([...(dto.interviewers ?? []), candidate.email])),
      subject: `Interview: ${candidate.name}`,
      body: ics,
    });
    return interview;
  }

  /** ICS text for an interview (used by the email + the /ics endpoint). */
  async getIcs(companyId: string, id: string): Promise<string> {
    const interview = await this.repo.getInterview(companyId, id);
    if (!interview) throw new NotFoundException('Interview not found.');
    const candidate = await this.repo.getCandidate(companyId, interview.candidateId);
    return this.icsFor(interview, candidate);
  }

  private icsFor(interview: Interview, candidate?: Candidate): string {
    return buildIcs({
      uid: interview.icsUid,
      start: interview.scheduledAt,
      durationMins: interview.durationMins,
      summary: `Interview${candidate ? ` — ${candidate.name}` : ''}`,
      description: `Vellora interview (${interview.mode}).`,
      location: interview.location ?? undefined,
      attendees: [...(interview.interviewers ?? []), ...(candidate ? [candidate.email] : [])],
    });
  }

  // ── insights ──────────────────────────────────────────────────────────────────
  async insights(companyId: string) {
    const rows = await this.repo.candidatesForInsights(companyId);
    const byStage: Record<string, number> = {
      applied: 0,
      review: 0,
      interview: 0,
      offer: 0,
      hired: 0,
      rejected: 0,
    };
    const bySource: Record<string, number> = {};
    for (const row of rows) {
      byStage[row.stage] = (byStage[row.stage] ?? 0) + 1;
      bySource[row.source] = (bySource[row.source] ?? 0) + 1;
    }
    return { total: rows.length, byStage, bySource };
  }

  // ── public careers (unauthenticated; tenant resolved by slug) ──────────────
  private async resolveCompany(slug: string): Promise<{ id: string; name: string }> {
    const company = await this.repo.companyBySlug(slug);
    if (!company) throw new NotFoundException('Careers page not found.');
    return company;
  }

  async publicListJobs(slug: string) {
    const company = await this.resolveCompany(slug);
    const jobs = await this.repo.listPublishedJobs(company.id);
    // Only expose public-safe fields — never leak internal columns.
    return {
      company: { name: company.name, slug },
      jobs: jobs.map((j) => ({
        slug: j.slug,
        title: j.title,
        location: j.location,
        employmentType: j.employmentType,
      })),
    };
  }

  async publicJobDetail(slug: string, jobSlug: string) {
    const company = await this.resolveCompany(slug);
    const job = await this.repo.publishedJobBySlug(company.id, jobSlug);
    if (!job) throw new NotFoundException('Job not found.');
    return {
      company: { name: company.name, slug },
      job: {
        slug: job.slug,
        title: job.title,
        description: job.description,
        location: job.location,
        employmentType: job.employmentType,
        screenerQuestions: job.screenerQuestions,
      },
    };
  }

  /** Signed upload URL for a resume on the public apply flow (no account). */
  async publicResumeUpload(slug: string, filename: string) {
    const company = await this.resolveCompany(slug);
    return this.storage.createSignedUpload(company.id, `careers/${filename}`);
  }

  async publicApply(slug: string, jobSlug: string, dto: ApplyDto): Promise<{ ok: true }> {
    const company = await this.resolveCompany(slug);
    const job = await this.repo.publishedJobBySlug(company.id, jobSlug);
    if (!job) throw new NotFoundException('Job not found.');
    if (!dto.consent) throw new BadRequestException('Consent is required to apply.');

    const candidate = await this.repo.createCandidate(company.id, {
      companyId: company.id,
      jobId: job.id,
      name: dto.name,
      email: dto.email,
      phone: dto.phone,
      resumeKey: dto.resumeKey,
      answers: dto.answers ?? {},
      source: 'careers',
      stage: 'applied',
      consentAt: new Date(),
    });

    // Notify recruiters in-app that a new application arrived.
    await this.notifications.broadcast(company.id, {
      role: 'hr',
      category: 'recruiting',
      type: 'candidate.applied',
      title: 'New application',
      body: `${candidate.name} applied for ${job.title}.`,
      href: `/recruiting/candidates/${candidate.id}`,
    });
    return { ok: true };
  }

  /** Guard: candidate read endpoints require a manager+ role (set upstream). */
  assertManager(): void {
    const role = this.tenant.get()?.user.role;
    if (role === 'employee') throw new ForbiddenException('Insufficient role.');
  }
}
