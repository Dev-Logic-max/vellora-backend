import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gt, ilike, inArray, type SQL } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import {
  conversationMembers,
  conversations,
  messages,
  reads,
  type Conversation,
  type ConversationMember,
  type Message,
  type NewConversation,
  type NewConversationMember,
  type NewMessage,
  type Read,
} from '../database/schema';

const SENDER_COLS = { id: true, name: true, email: true, avatarUrl: true } as const;

/** All messaging Drizzle access, RLS-scoped via DatabaseService.withTenant. */
@Injectable()
export class MessagingRepository {
  constructor(private readonly db: DatabaseService) {}

  // ── conversations ─────────────────────────────────────────────────────────
  /** Conversations a user belongs to, newest activity first. */
  listForUser(companyId: string, userId: string): Promise<Conversation[]> {
    return this.db.withTenant(companyId, async (tx) => {
      const memberRows = await tx.query.conversationMembers.findMany({
        where: eq(conversationMembers.userId, userId),
        columns: { conversationId: true },
      });
      const ids = memberRows.map((m) => m.conversationId);
      if (ids.length === 0) return [];
      return tx.query.conversations.findMany({
        where: inArray(conversations.id, ids),
        orderBy: [desc(conversations.lastMessageAt), desc(conversations.createdAt)],
        with: { members: { with: { user: { columns: SENDER_COLS } } } },
        limit: 200,
      });
    });
  }

  findConversation(companyId: string, id: string) {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.conversations.findFirst({
        where: eq(conversations.id, id),
        with: { members: { with: { user: { columns: SENDER_COLS } } } },
      }),
    );
  }

  /** Existing 1:1 DM between exactly two users (avoids duplicate DMs). */
  findDmBetween(companyId: string, userA: string, userB: string) {
    return this.db.withTenant(companyId, async (tx) => {
      const rows = await tx.query.conversations.findMany({
        where: eq(conversations.kind, 'dm'),
        with: { members: { columns: { userId: true } } },
        limit: 500,
      });
      return rows.find(
        (c) =>
          c.members.length === 2 &&
          c.members.some((m) => m.userId === userA) &&
          c.members.some((m) => m.userId === userB),
      );
    });
  }

  createConversation(companyId: string, values: NewConversation): Promise<Conversation> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx.insert(conversations).values(values).returning();
      return row;
    });
  }

  touchConversation(companyId: string, id: string): Promise<void> {
    return this.db.withTenant(companyId, async (tx) => {
      await tx
        .update(conversations)
        .set({ lastMessageAt: new Date() })
        .where(eq(conversations.id, id));
    });
  }

  // ── members ───────────────────────────────────────────────────────────────
  addMembers(companyId: string, values: NewConversationMember[]): Promise<ConversationMember[]> {
    if (values.length === 0) return Promise.resolve([]);
    return this.db.withTenant(companyId, (tx) =>
      tx.insert(conversationMembers).values(values).onConflictDoNothing().returning(),
    );
  }

  isMember(companyId: string, conversationId: string, userId: string): Promise<boolean> {
    return this.db.withTenant(companyId, async (tx) => {
      const row = await tx.query.conversationMembers.findFirst({
        where: and(
          eq(conversationMembers.conversationId, conversationId),
          eq(conversationMembers.userId, userId),
        ),
        columns: { id: true },
      });
      return Boolean(row);
    });
  }

  memberIds(companyId: string, conversationId: string): Promise<string[]> {
    return this.db.withTenant(companyId, async (tx) => {
      const rows = await tx.query.conversationMembers.findMany({
        where: eq(conversationMembers.conversationId, conversationId),
        columns: { userId: true },
      });
      return rows.map((r) => r.userId);
    });
  }

  // ── messages ──────────────────────────────────────────────────────────────
  listMessages(companyId: string, conversationId: string): Promise<Message[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.messages.findMany({
        where: eq(messages.conversationId, conversationId),
        orderBy: asc(messages.createdAt),
        with: { sender: { columns: SENDER_COLS } },
        limit: 500,
      }),
    );
  }

  createMessage(companyId: string, values: NewMessage): Promise<Message> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx.insert(messages).values(values).returning();
      return row;
    });
  }

  search(companyId: string, userId: string, q: string): Promise<Message[]> {
    return this.db.withTenant(companyId, async (tx) => {
      const memberRows = await tx.query.conversationMembers.findMany({
        where: eq(conversationMembers.userId, userId),
        columns: { conversationId: true },
      });
      const ids = memberRows.map((m) => m.conversationId);
      if (ids.length === 0) return [];
      return tx.query.messages.findMany({
        where: and(inArray(messages.conversationId, ids), ilike(messages.body, `%${q}%`)),
        orderBy: desc(messages.createdAt),
        with: { sender: { columns: SENDER_COLS } },
        limit: 100,
      });
    });
  }

  // ── reads / unread ──────────────────────────────────────────────────────────
  getRead(companyId: string, conversationId: string, userId: string) {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.reads.findFirst({
        where: and(eq(reads.conversationId, conversationId), eq(reads.userId, userId)),
      }),
    );
  }

  upsertRead(companyId: string, conversationId: string, userId: string, messageId: string) {
    return this.db.withTenant(companyId, async (tx) => {
      await tx
        .insert(reads)
        .values({ companyId, conversationId, userId, lastReadMessageId: messageId })
        .onConflictDoUpdate({
          target: [reads.conversationId, reads.userId],
          set: { lastReadMessageId: messageId, updatedAt: new Date() },
        });
    });
  }

  /** Count of messages in a conversation newer than the user's last-read marker. */
  async unreadCount(
    companyId: string,
    conversationId: string,
    userId: string,
    afterMessageId: string | null,
  ): Promise<number> {
    return this.db.withTenant(companyId, async (tx) => {
      let after: Date | undefined;
      if (afterMessageId) {
        const marker = await tx.query.messages.findFirst({
          where: eq(messages.id, afterMessageId),
          columns: { createdAt: true },
        });
        after = marker?.createdAt;
      }
      const conds: SQL[] = [eq(messages.conversationId, conversationId)];
      if (after) conds.push(gt(messages.createdAt, after));
      const rows = await tx.query.messages.findMany({
        where: and(...conds),
        columns: { id: true, senderId: true },
        limit: 1000,
      });
      // Don't count the user's own messages as unread.
      return rows.filter((r) => r.senderId !== userId).length;
    });
  }

  listReads(companyId: string, conversationId: string): Promise<Read[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.reads.findMany({ where: eq(reads.conversationId, conversationId) }),
    );
  }
}
