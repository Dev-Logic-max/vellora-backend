import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import type { AppConfig } from '../config/configuration';
import type { EmailMessage } from '../database/schema';
import { MailerService } from '../infra/mailer.service';
import { QueueService } from '../infra/queue.service';
import { EmailRepository } from './email.repository';
import type { SendEmailDto } from './dto/messaging.dto';

export const EMAIL_SEND_QUEUE = 'email-send';

/**
 * Basic email tab (13-messaging §3): compose + send via Resend on a queued
 * BullMQ job (TLS handled by Resend). Threads/messages are tenant-scoped.
 * Inbound parsing is a later/stub concern.
 */
@Injectable()
export class EmailService {
  private readonly from: string;

  constructor(
    private readonly repo: EmailRepository,
    private readonly tenant: TenantContextService,
    private readonly queue: QueueService,
    private readonly mailer: MailerService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.from = config.get('email.from', { infer: true });
    // Worker: deliver a queued email message and record the result.
    this.queue.register(EMAIL_SEND_QUEUE, async (job) => {
      const data = job.data as {
        companyId: string;
        messageId: string;
        to: string[];
        subject: string;
        body: string;
      };
      const result = await this.mailer.send({
        to: data.to,
        subject: data.subject,
        body: data.body,
      });
      await this.repo.updateMessage(data.companyId, data.messageId, {
        status: result.ok ? 'sent' : 'failed',
        providerId: result.providerId,
        sentAt: result.ok ? new Date() : undefined,
      });
    });
  }

  listThreads(companyId: string) {
    return this.repo.listThreads(companyId);
  }

  async getThread(companyId: string, id: string) {
    const thread = await this.repo.findThread(companyId, id);
    if (!thread) throw new NotFoundException('Thread not found.');
    return thread;
  }

  /** Compose + enqueue an email; creates a thread when none is referenced. */
  async send(companyId: string, dto: SendEmailDto): Promise<EmailMessage> {
    const userId = this.tenant.get()?.user.userId;

    let threadId = dto.threadId;
    if (!threadId) {
      const thread = await this.repo.createThread(companyId, {
        companyId,
        subject: dto.subject ?? '(no subject)',
        participants: dto.to,
        createdBy: userId,
      });
      threadId = thread.id;
    }

    const message = await this.repo.createMessage(companyId, {
      companyId,
      threadId,
      fromAddr: this.from,
      toAddrs: dto.to,
      body: dto.body,
      status: 'queued',
    });
    await this.repo.touchThread(companyId, threadId);

    await this.queue.enqueue(EMAIL_SEND_QUEUE, 'email-send', {
      companyId,
      messageId: message.id,
      to: dto.to,
      subject: dto.subject ?? '(no subject)',
      body: dto.body,
    });
    return message;
  }
}
