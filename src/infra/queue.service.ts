import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, type ConnectionOptions, type Processor } from 'bullmq';
import type { AppConfig } from '../config/configuration';

/**
 * Thin BullMQ wrapper with graceful degradation. With REDIS_URL set, jobs are
 * enqueued to a real queue and processed by registered workers. Without it (dev
 * / no infra), `enqueue` runs the job's processor INLINE so flows still
 * complete — the code path is identical, only the transport changes.
 *
 * We hand BullMQ connection OPTIONS (a URL) rather than a constructed ioredis
 * client so the queue and worker own their own connections — avoids coupling to
 * a specific ioredis instance/version.
 */
@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly connection?: ConnectionOptions;
  private readonly queues = new Map<string, Queue>();
  private readonly workers = new Map<string, Worker>();
  private readonly inlineProcessors = new Map<string, Processor>();

  constructor(config: ConfigService<AppConfig, true>) {
    const url = config.get('redis.url', { infer: true });
    if (url) {
      this.connection = { url, maxRetriesPerRequest: null };
    } else {
      this.logger.warn('REDIS_URL unset — queue jobs run inline (no background processing).');
    }
  }

  get enabled(): boolean {
    return Boolean(this.connection);
  }

  /** Register a processor for a named queue. Must be called once per queue at boot. */
  register(name: string, processor: Processor): void {
    this.inlineProcessors.set(name, processor);
    if (this.connection) {
      const worker = new Worker(name, processor, { connection: this.connection });
      worker.on('failed', (job, err) =>
        this.logger.error(`Job ${name}:${job?.id} failed: ${err.message}`),
      );
      this.workers.set(name, worker);
    }
  }

  /** Enqueue a job, or run it inline when Redis is unavailable. */
  async enqueue<T>(queue: string, jobName: string, data: T): Promise<void> {
    if (this.connection) {
      let q = this.queues.get(queue);
      if (!q) {
        q = new Queue(queue, { connection: this.connection });
        this.queues.set(queue, q);
      }
      await q.add(jobName, data, { removeOnComplete: 100, removeOnFail: 200, attempts: 3 });
      return;
    }
    const processor = this.inlineProcessors.get(queue);
    if (!processor) return;
    try {
      // Minimal Job-like shape for inline execution.
      await processor({ name: jobName, data } as Parameters<Processor>[0]);
    } catch (err) {
      this.logger.error(`Inline job ${queue}:${jobName} failed: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.workers.values()].map((w) => w.close()));
    await Promise.all([...this.queues.values()].map((q) => q.close()));
  }
}
