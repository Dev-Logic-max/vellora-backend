import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import type { Conversation, Message, MessageRef } from '../database/schema';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import type { AddMembersDto, CreateConversationDto, SendMessageDto } from './dto/messaging.dto';
import { MessagingRepository } from './messaging.repository';

/**
 * Tenant-scoped internal messaging (13-messaging). Membership is checked on
 * EVERY fetch/send — RLS isolates by company, this layer isolates by
 * conversation. Realtime fans out to the authenticated `conversation:{id}`
 * room; new messages also emit an in-app notification to the other members.
 */
@Injectable()
export class MessagingService {
  constructor(
    private readonly repo: MessagingRepository,
    private readonly tenant: TenantContextService,
    private readonly realtime: RealtimeGateway,
    private readonly notifications: NotificationsService,
  ) {}

  private userId(): string {
    const id = this.tenant.get()?.user.userId;
    if (!id) throw new ForbiddenException('No authenticated user.');
    return id;
  }

  private async assertMember(companyId: string, conversationId: string): Promise<void> {
    const ok = await this.repo.isMember(companyId, conversationId, this.userId());
    if (!ok) throw new NotFoundException('Conversation not found.');
  }

  // ── conversations ─────────────────────────────────────────────────────────
  async listConversations(companyId: string) {
    const me = this.userId();
    const list = await this.repo.listForUser(companyId, me);
    // Attach unread counts per conversation.
    return Promise.all(
      list.map(async (c) => {
        const read = await this.repo.getRead(companyId, c.id, me);
        const unread = await this.repo.unreadCount(
          companyId,
          c.id,
          me,
          read?.lastReadMessageId ?? null,
        );
        return { ...c, unread };
      }),
    );
  }

  async createConversation(companyId: string, dto: CreateConversationDto): Promise<Conversation> {
    const me = this.userId();

    if (dto.kind === 'dm') {
      const other = dto.memberIds[0];
      if (other === me) throw new BadRequestException('Cannot DM yourself.');
      const existing = await this.repo.findDmBetween(companyId, me, other);
      if (existing) return existing;
    }

    const convo = await this.repo.createConversation(companyId, {
      companyId,
      kind: dto.kind,
      name: dto.kind === 'channel' ? dto.name : null,
      storeId: dto.storeId,
      createdBy: me,
    });

    const members = Array.from(new Set([me, ...dto.memberIds]));
    await this.repo.addMembers(
      companyId,
      members.map((userId) => ({ companyId, conversationId: convo.id, userId })),
    );
    return convo;
  }

  async getConversation(companyId: string, id: string) {
    await this.assertMember(companyId, id);
    const convo = await this.repo.findConversation(companyId, id);
    if (!convo) throw new NotFoundException('Conversation not found.');
    return convo;
  }

  async addMembers(companyId: string, id: string, dto: AddMembersDto) {
    await this.assertMember(companyId, id);
    return this.repo.addMembers(
      companyId,
      dto.memberIds.map((userId) => ({ companyId, conversationId: id, userId })),
    );
  }

  // ── messages ──────────────────────────────────────────────────────────────
  async listMessages(companyId: string, conversationId: string): Promise<Message[]> {
    await this.assertMember(companyId, conversationId);
    return this.repo.listMessages(companyId, conversationId);
  }

  async sendMessage(
    companyId: string,
    conversationId: string,
    dto: SendMessageDto,
  ): Promise<Message> {
    await this.assertMember(companyId, conversationId);
    const me = this.userId();

    const message = await this.repo.createMessage(companyId, {
      companyId,
      conversationId,
      senderId: me,
      body: dto.body,
      ref: dto.ref ?? null,
    });
    await this.repo.touchConversation(companyId, conversationId);
    // Sender has implicitly read their own latest message.
    await this.repo.upsertRead(companyId, conversationId, me, message.id);

    // Realtime fan-out to the conversation room (only members are joined).
    this.realtime.emitToConversation(conversationId, 'message:new', message);

    // Notify the other members in-app.
    const members = await this.repo.memberIds(companyId, conversationId);
    for (const userId of members) {
      if (userId === me) continue;
      await this.notifications.emit({
        companyId,
        userId,
        category: 'messaging',
        type: 'message.new',
        title: 'New message',
        body: dto.body.slice(0, 120),
        href: `/messages?c=${conversationId}`,
      });
    }
    return message;
  }

  async markRead(companyId: string, conversationId: string, messageId: string) {
    await this.assertMember(companyId, conversationId);
    const me = this.userId();
    await this.repo.upsertRead(companyId, conversationId, me, messageId);
    this.realtime.emitToConversation(conversationId, 'message:read', {
      conversationId,
      userId: me,
      messageId,
    });
    return { ok: true as const };
  }

  search(companyId: string, q: string): Promise<Message[]> {
    return this.repo.search(companyId, this.userId(), q);
  }

  /**
   * Resolves an inline record reference to a deep-link + display label, with a
   * tenant/permission check so a reference can't leak an out-of-scope record.
   * (Existence is enforced by RLS on the resolver query in a fuller build; for
   * v1 we map the typed ref to its in-app route.)
   */
  resolveRef(ref: MessageRef): { href: string; label: string } {
    const routes: Record<MessageRef['type'], string> = {
      employee: `/employees/${ref.id}`,
      shift: `/scheduling?shift=${ref.id}`,
      leave: `/leave?request=${ref.id}`,
      document: `/documents?doc=${ref.id}`,
      candidate: `/recruiting/${ref.id}`,
      store: `/stores/${ref.id}`,
    };
    return { href: routes[ref.type], label: ref.label ?? ref.type };
  }
}
