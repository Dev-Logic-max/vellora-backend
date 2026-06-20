import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { GeminiService } from '../ai/gemini.service';
import type { ReportRun } from '../database/schema';
import { QueueService } from '../infra/queue.service';
import { StorageService } from '../infra/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { CreateReportDefDto, ReportFiltersDto } from './dto/reports.dto';
import { ReportsRepository, type AttendanceRow } from './reports.repository';
import { localDay } from './store-tz';

export const REPORTS_QUEUE = 'reports';

interface Range {
  from: Date;
  to: Date;
}

/** Default window: the last 30 days up to now. */
function resolveRange(filters?: { from?: string; to?: string }): Range {
  const to = filters?.to ? new Date(filters.to) : new Date();
  const from = filters?.from ? new Date(filters.from) : new Date(to.getTime() - 30 * 86_400_000);
  return { from, to };
}

function toCsv(rows: Record<string, string | number>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [headers.join(',')];
  for (const row of rows) lines.push(headers.map((h) => escape(row[h] ?? '')).join(','));
  return lines.join('\n');
}

/**
 * Reports & analytics (16-reports). Aggregates are computed across modules with
 * day-boundary math in the STORE timezone (i18n-and-time.md). Scheduled runs +
 * exports go through BullMQ → private storage + a notification. AI insight
 * summaries come from GeminiService (graceful-degrade).
 */
@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);
  /** Assumed hourly labor rate (no per-employee rate column yet — v1 estimate). */
  private readonly HOURLY_RATE = 15;

  constructor(
    private readonly repo: ReportsRepository,
    private readonly storage: StorageService,
    private readonly queue: QueueService,
    private readonly notifications: NotificationsService,
    private readonly gemini: GeminiService,
  ) {
    this.queue.register(REPORTS_QUEUE, async (job) => {
      if (job.name === 'run') {
        const { companyId, runId, defId } = job.data as {
          companyId: string;
          runId: string;
          defId: string;
        };
        await this.executeRun(companyId, runId, defId);
      }
      if (job.name === 'scheduled-sweep') await this.scheduledSweep();
    });
  }

  // ── dashboards (aggregates) ──────────────────────────────────────────────────
  async dashboard(companyId: string, type: string, filters: ReportFiltersDto) {
    switch (type) {
      case 'headcount':
        return this.headcount(companyId, filters);
      case 'attendance':
        return this.attendanceSummary(companyId, filters);
      case 'turnover':
        return this.turnover(companyId, filters);
      case 'labor':
        return this.laborCost(companyId, filters);
      default:
        throw new NotFoundException('Unknown report type.');
    }
  }

  private async headcount(companyId: string, filters: ReportFiltersDto) {
    const employees = await this.repo.employees(companyId, filters.storeId);
    const byStatus: Record<string, number> = {};
    const byDepartment: Record<string, number> = {};
    for (const e of employees) {
      byStatus[e.status] = (byStatus[e.status] ?? 0) + 1;
      const dept = e.department ?? 'Unassigned';
      byDepartment[dept] = (byDepartment[dept] ?? 0) + 1;
    }
    const active = employees.filter((e) => e.status === 'active' && !e.deletedAt).length;
    return { total: employees.length, active, byStatus, byDepartment };
  }

  /** Worked minutes per store-local day, summed across logs in range. */
  private async attendanceSummary(companyId: string, filters: ReportFiltersDto) {
    const range = resolveRange(filters);
    const logs = await this.repo.attendanceLogs(companyId, range, filters.storeId);
    const tzByStore = await this.storeTzMap(companyId);
    const byDay: Record<string, { minutes: number; shifts: number }> = {};
    for (const log of logs) {
      const tz = tzByStore[log.storeId] ?? 'UTC';
      const day = localDay(log.clockInUtc, tz);
      const minutes = this.workedMinutes(log);
      byDay[day] ??= { minutes: 0, shifts: 0 };
      byDay[day].minutes += minutes;
      byDay[day].shifts += 1;
    }
    const series = Object.entries(byDay)
      .map(([day, v]) => ({ day, hours: Math.round((v.minutes / 60) * 10) / 10, shifts: v.shifts }))
      .sort((a, b) => a.day.localeCompare(b.day));
    const totalHours = series.reduce((s, d) => s + d.hours, 0);
    return { totalHours: Math.round(totalHours * 10) / 10, shifts: logs.length, series };
  }

  private async turnover(companyId: string, filters: ReportFiltersDto) {
    const range = resolveRange(filters);
    const employees = await this.repo.employees(companyId, filters.storeId);
    const hires = employees.filter(
      (e) => e.hireDate && new Date(e.hireDate) >= range.from && new Date(e.hireDate) <= range.to,
    ).length;
    const leavers = employees.filter(
      (e) => e.deletedAt && e.deletedAt >= range.from && e.deletedAt <= range.to,
    ).length;
    const active = employees.filter((e) => e.status === 'active' && !e.deletedAt).length;
    const rate = active > 0 ? Math.round((leavers / active) * 1000) / 10 : 0;
    return { hires, leavers, active, turnoverRate: rate };
  }

  private async laborCost(companyId: string, filters: ReportFiltersDto) {
    const summary = await this.attendanceSummary(companyId, filters);
    const series = summary.series.map((d) => ({
      day: d.day,
      cost: Math.round(d.hours * this.HOURLY_RATE * 100) / 100,
    }));
    const total = Math.round(summary.totalHours * this.HOURLY_RATE * 100) / 100;
    return { totalCost: total, hourlyRate: this.HOURLY_RATE, series };
  }

  private workedMinutes(log: AttendanceRow): number {
    if (!log.clockOutUtc) return 0;
    return Math.max(0, (log.clockOutUtc.getTime() - log.clockInUtc.getTime()) / 60_000);
  }

  private async storeTzMap(companyId: string): Promise<Record<string, string>> {
    const stores = await this.repo.stores(companyId);
    return Object.fromEntries(stores.map((s) => [s.id, s.timezone]));
  }

  // ── saved defs + runs ──────────────────────────────────────────────────────
  listDefs(companyId: string) {
    return this.repo.listDefs(companyId);
  }

  createDef(companyId: string, dto: CreateReportDefDto, userId?: string) {
    return this.repo.createDef(companyId, {
      companyId,
      name: dto.name,
      type: dto.type,
      config: dto.config,
      schedule: dto.schedule,
      recipients: dto.recipients,
      createdBy: userId,
    });
  }

  listRuns(companyId: string, defId: string) {
    return this.repo.listRuns(companyId, defId);
  }

  /** Enqueue a run for a saved report def; returns the queued run row. */
  async run(companyId: string, defId: string): Promise<ReportRun> {
    const def = await this.repo.getDef(companyId, defId);
    if (!def) throw new NotFoundException('Report not found.');
    const run = await this.repo.createRun(companyId, {
      companyId,
      reportDefId: defId,
      status: 'queued',
      format: 'csv',
    });
    await this.queue.enqueue(REPORTS_QUEUE, 'run', { companyId, runId: run.id, defId });
    return run;
  }

  async exportUrl(companyId: string, runId: string): Promise<{ url: string | null }> {
    const run = await this.repo.getRun(companyId, runId);
    if (!run) throw new NotFoundException('Run not found.');
    if (!run.outputKey) return { url: null };
    return { url: await this.storage.createSignedDownload(run.outputKey) };
  }

  /** Worker: compute the def's report, write a CSV to storage, notify. */
  private async executeRun(companyId: string, runId: string, defId: string): Promise<void> {
    try {
      await this.repo.updateRun(companyId, runId, { status: 'running' });
      const def = await this.repo.getDef(companyId, defId);
      if (!def) throw new Error('Report definition missing.');

      const data = await this.dashboard(companyId, def.type, def.config ?? {});
      const csv = this.reportToCsv(data);

      const { url, storageKey } = await this.storage.createSignedUpload(
        companyId,
        `reports/${def.type}-${Date.now()}.csv`,
      );
      try {
        await fetch(url, { method: 'PUT', body: csv });
      } catch {
        /* dev stub URL — ignore */
      }

      await this.repo.updateRun(companyId, runId, {
        status: 'ready',
        outputKey: storageKey,
        ranAt: new Date(),
      });

      // Notify the company owners that the report is ready.
      await this.notifications.broadcast(companyId, {
        role: 'owner',
        category: 'reports',
        type: 'report.ready',
        title: 'Report ready',
        body: `${def.name} has finished generating.`,
        href: '/reports',
      });
    } catch (err) {
      this.logger.error(`Report run ${runId} failed: ${(err as Error).message}`);
      await this.repo.updateRun(companyId, runId, {
        status: 'failed',
        error: (err as Error).message,
      });
    }
  }

  private reportToCsv(data: unknown): string {
    // Flatten the known report shapes into row arrays for CSV.
    const d = data as Record<string, unknown>;
    if (Array.isArray(d.series)) {
      return toCsv(d.series as Record<string, string | number>[]);
    }
    if (d.byStatus || d.byDepartment) {
      const rows = Object.entries((d.byStatus ?? {}) as Record<string, number>).map(
        ([key, value]) => ({ metric: key, value }),
      );
      return toCsv(rows);
    }
    return toCsv([d as Record<string, string | number>]);
  }

  /** Nightly: enqueue a run for every scheduled report def. */
  async scheduledSweep(): Promise<void> {
    const defs = await this.repo.scheduledDefs();
    for (const def of defs) {
      if (!def.schedule) continue;
      const run = await this.repo.createRun(def.companyId, {
        companyId: def.companyId,
        reportDefId: def.id,
        status: 'queued',
        format: 'csv',
      });
      await this.queue.enqueue(REPORTS_QUEUE, 'run', {
        companyId: def.companyId,
        runId: run.id,
        defId: def.id,
      });
    }
  }

  enqueueScheduledSweep(): Promise<{ queued: true }> {
    return this.queue
      .enqueue(REPORTS_QUEUE, 'scheduled-sweep', {})
      .then(() => ({ queued: true as const }));
  }

  // ── AI insights ──────────────────────────────────────────────────────────────
  async insights(companyId: string, storeId?: string): Promise<{ summary: string }> {
    const [headcount, attendance, turnover] = await Promise.all([
      this.headcount(companyId, { storeId }),
      this.attendanceSummary(companyId, { storeId }),
      this.turnover(companyId, { storeId }),
    ]);
    const summary = await this.gemini.summarizeInsights({ headcount, attendance, turnover });
    return { summary };
  }
}
