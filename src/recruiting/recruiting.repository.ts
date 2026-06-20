import { Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import {
  candidates,
  companies,
  interviews,
  jobs,
  type Candidate,
  type Interview,
  type Job,
  type NewCandidate,
  type NewInterview,
  type NewJob,
} from '../database/schema';

/** All recruiting Drizzle access. Tenant rows go through RLS via withTenant.
 * The public careers path resolves the company by slug on the privileged
 * connection first, then reads tenant-scoped under that company id. */
@Injectable()
export class RecruitingRepository {
  constructor(private readonly db: DatabaseService) {}

  // ── company slug resolution (public path) ───────────────────────────────────
  /** Resolve a company id from its public slug (privileged; no tenant token). */
  async companyBySlug(slug: string): Promise<{ id: string; name: string } | undefined> {
    const row = await this.db.db.query.companies.findFirst({
      where: eq(companies.slug, slug),
      columns: { id: true, name: true },
    });
    return row;
  }

  // ── jobs ────────────────────────────────────────────────────────────────────
  listJobs(companyId: string): Promise<Job[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.jobs.findMany({ orderBy: desc(jobs.createdAt), limit: 500 }),
    );
  }

  getJob(companyId: string, id: string): Promise<Job | undefined> {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.jobs.findFirst({ where: eq(jobs.id, id) }),
    );
  }

  createJob(companyId: string, values: NewJob): Promise<Job> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx.insert(jobs).values(values).returning();
      return row;
    });
  }

  updateJob(companyId: string, id: string, set: Partial<NewJob>): Promise<Job | undefined> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx.update(jobs).set(set).where(eq(jobs.id, id)).returning();
      return row;
    });
  }

  slugExists(companyId: string, slug: string): Promise<boolean> {
    return this.db.withTenant(companyId, async (tx) => {
      const row = await tx.query.jobs.findFirst({
        where: eq(jobs.slug, slug),
        columns: { id: true },
      });
      return Boolean(row);
    });
  }

  // ── public careers reads (scoped to the resolved company) ───────────────────
  listPublishedJobs(companyId: string): Promise<Job[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.jobs.findMany({
        where: and(eq(jobs.published, true), eq(jobs.status, 'published')),
        orderBy: desc(jobs.createdAt),
        limit: 200,
      }),
    );
  }

  publishedJobBySlug(companyId: string, slug: string): Promise<Job | undefined> {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.jobs.findFirst({
        where: and(eq(jobs.slug, slug), eq(jobs.published, true)),
      }),
    );
  }

  // ── candidates ────────────────────────────────────────────────────────────────
  listCandidates(companyId: string, jobId?: string): Promise<Candidate[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.candidates.findMany({
        where: jobId ? eq(candidates.jobId, jobId) : undefined,
        orderBy: desc(candidates.createdAt),
        with: { job: { columns: { id: true, title: true } } },
        limit: 1000,
      }),
    );
  }

  getCandidate(companyId: string, id: string): Promise<Candidate | undefined> {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.candidates.findFirst({
        where: eq(candidates.id, id),
        with: { job: true, interviews: true },
      }),
    );
  }

  createCandidate(companyId: string, values: NewCandidate): Promise<Candidate> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx.insert(candidates).values(values).returning();
      return row;
    });
  }

  updateCandidate(
    companyId: string,
    id: string,
    set: Partial<NewCandidate>,
  ): Promise<Candidate | undefined> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx.update(candidates).set(set).where(eq(candidates.id, id)).returning();
      return row;
    });
  }

  // ── interviews ───────────────────────────────────────────────────────────────
  createInterview(companyId: string, values: NewInterview): Promise<Interview> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx.insert(interviews).values(values).returning();
      return row;
    });
  }

  getInterview(companyId: string, id: string): Promise<Interview | undefined> {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.interviews.findFirst({ where: eq(interviews.id, id) }),
    );
  }

  // ── insights ──────────────────────────────────────────────────────────────────
  /** All candidates for a company (lightweight columns) — funnel aggregation. */
  candidatesForInsights(companyId: string): Promise<Pick<Candidate, 'stage' | 'source'>[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.candidates.findMany({ columns: { stage: true, source: true }, limit: 5000 }),
    );
  }
}
