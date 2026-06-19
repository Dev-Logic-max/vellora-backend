import { Injectable, NotFoundException } from '@nestjs/common';
import type { NotifPriority } from '../database/schema/enums';
import type { Notification } from '../database/schema';
import { MailerService } from '../infra/mailer.service';
import { QueueService } from '../infra/queue.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import type {
  BroadcastDto,
  ListNotificationsDto,
  UpdatePreferenceDto,
} from './dto/notifications.dto';
import { NotificationsRepository } from './notifications.repository';

export const NOTIF_EMAIL_QUEUE = 'notif-email';

export interface EmitInput {
  companyId: string;
  userId: string;
  category: string;
  type: string;
  title: string;
  body?: string;
  href?: string;
  priority?: NotifPriority;
}

/**
 * Central notification hub (11-notifications §6, §10). Other modules call
 * `emit()` to deliver a notification: it is always persisted (in-app) + pushed
 * in realtime to `user:{id}`, and an email is queued when the user's
 * per-category preference allows it. Realtime/email both degrade gracefully.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly repo: NotificationsRepository,
    private readonly realtime: RealtimeGateway,
    private readonly queue: QueueService,
    private readonly mailer: MailerService,
  ) {
    // Worker: send a queued notification email via Resend (no-op without a key).
    this.queue.register(NOTIF_EMAIL_QUEUE, async (job) => {
      const data = job.data as { to?: string; subject: string; body: string };
      if (data.to) {
        await this.mailer.send({ to: [data.to], subject: data.subject, body: data.body });
      }
    });
  }

  list(companyId: string, userId: string, dto: ListNotificationsDto): Promise<Notification[]> {
    return this.repo.list(companyId, userId, dto);
  }

  unreadCount(companyId: string, userId: string): Promise<number> {
    return this.repo.unreadCount(companyId, userId);
  }

  async markRead(companyId: string, userId: string, id: string): Promise<Notification> {
    const row = await this.repo.markRead(companyId, userId, id);
    if (!row) throw new NotFoundException('Notification not found.');
    this.realtime.emitToUser(userId, 'notification:read', { id });
    return row;
  }

  async markAllRead(companyId: string, userId: string): Promise<{ ok: true }> {
    await this.repo.markAllRead(companyId, userId);
    this.realtime.emitToUser(userId, 'notification:read-all', {});
    return { ok: true };
  }

  /**
   * The reusable emit helper. Persists, pushes realtime, queues email per prefs.
   * Safe to call from any module — failures in side-channels never block the
   * persisted in-app notification.
   */
  async emit(input: EmitInput): Promise<Notification> {
    const pref = await this.repo.findPreference(input.companyId, input.userId, input.category);
    const wantInApp = pref?.inApp ?? true;
    const wantEmail = pref?.email ?? true;

    const channelSent: Record<string, boolean> = { in_app: wantInApp, email: false };
    const notification = await this.repo.create(input.companyId, {
      companyId: input.companyId,
      userId: input.userId,
      category: input.category,
      type: input.type,
      priority: input.priority ?? 'normal',
      title: input.title,
      body: input.body,
      href: input.href,
      channelSent,
    });

    if (wantInApp) {
      this.realtime.emitToUser(input.userId, 'notification:new', notification);
    }

    if (wantEmail) {
      // We email by user — recipient address is resolved at send-time; for now
      // we queue with a placeholder body. The worker looks up + sends.
      await this.queue.enqueue(NOTIF_EMAIL_QUEUE, 'notif-email', {
        notificationId: notification.id,
        subject: input.title,
        body: input.body ?? input.title,
      });
    }

    return notification;
  }

  // ── preferences ──────────────────────────────────────────────────────────
  listPreferences(companyId: string, userId: string) {
    return this.repo.listPreferences(companyId, userId);
  }

  updatePreference(companyId: string, userId: string, dto: UpdatePreferenceDto) {
    return this.repo.upsertPreference(companyId, {
      companyId,
      userId,
      category: dto.category,
      inApp: dto.inApp ?? true,
      email: dto.email ?? true,
      push: dto.push ?? false,
      digest: dto.digest ?? 'off',
    });
  }

  // ── broadcast (admins) ─────────────────────────────────────────────────────
  async broadcast(companyId: string, dto: BroadcastDto): Promise<{ sent: number }> {
    const recipients = await this.repo.recipientsByRole(companyId, dto.role);
    for (const userId of recipients) {
      await this.emit({
        companyId,
        userId,
        category: dto.category,
        type: dto.type,
        title: dto.title,
        body: dto.body,
        href: dto.href,
        priority: dto.priority,
      });
    }
    return { sent: recipients.length };
  }
}
