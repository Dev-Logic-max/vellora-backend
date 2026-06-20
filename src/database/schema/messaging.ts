import { relations, sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { conversationKindEnum, emailStatusEnum } from './enums';
import { stores } from './stores';
import { users } from './users';

/**
 * Internal messaging (13-messaging §3): DMs + channels, realtime over Socket.IO
 * to `conversation:{id}`. Membership is enforced on every fetch/send, on top of
 * RLS on company_id.
 */
export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    kind: conversationKindEnum('kind').notNull().default('dm'),
    /** Required for channels; null for DMs (derived from members). */
    name: text('name'),
    storeId: uuid('store_id').references(() => stores.id, { onDelete: 'set null' }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('conversations_company_id_idx').on(table.companyId)],
);

/** Membership rows — who is in a conversation (13-messaging §3). */
export const conversationMembers = pgTable(
  'conversation_members',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('conversation_members_unique').on(table.conversationId, table.userId),
    index('conversation_members_company_id_idx').on(table.companyId),
    index('conversation_members_user_id_idx').on(table.userId),
  ],
);

/** A message. `ref` embeds a typed link to any platform record (employee/shift/…). */
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    senderId: uuid('sender_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    /** Optional record reference: { type: 'employee'|'shift'|'document'|..., id, label? }. */
    ref: jsonb('ref'),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('messages_company_id_idx').on(table.companyId),
    index('messages_conversation_id_idx').on(table.conversationId),
  ],
);

/** Per-member read marker — `lastReadMessageId` drives unread counts. */
export const reads = pgTable(
  'reads',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lastReadMessageId: uuid('last_read_message_id'),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [unique('reads_conversation_user_unique').on(table.conversationId, table.userId)],
);

// ── Email (13-messaging §3) ──────────────────────────────────────────────────
/** A simple email thread (compose + transactional history). */
export const emailThreads = pgTable(
  'email_threads',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    subject: text('subject').notNull(),
    /** Participant addresses, denormalized for list display. */
    participants: jsonb('participants')
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('email_threads_company_id_idx').on(table.companyId)],
);

export const emailMessages = pgTable(
  'email_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => emailThreads.id, { onDelete: 'cascade' }),
    fromAddr: text('from_addr').notNull(),
    toAddrs: jsonb('to_addrs')
      .notNull()
      .default(sql`'[]'::jsonb`),
    body: text('body').notNull(),
    status: emailStatusEnum('status').notNull().default('queued'),
    /** Resend message id once accepted by the provider. */
    providerId: text('provider_id'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('email_messages_company_id_idx').on(table.companyId),
    index('email_messages_thread_id_idx').on(table.threadId),
  ],
);

export const conversationsRelations = relations(conversations, ({ many, one }) => ({
  members: many(conversationMembers),
  messages: many(messages),
  store: one(stores, { fields: [conversations.storeId], references: [stores.id] }),
}));

export const conversationMembersRelations = relations(conversationMembers, ({ one }) => ({
  conversation: one(conversations, {
    fields: [conversationMembers.conversationId],
    references: [conversations.id],
  }),
  user: one(users, { fields: [conversationMembers.userId], references: [users.id] }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  sender: one(users, { fields: [messages.senderId], references: [users.id] }),
}));

export const emailThreadsRelations = relations(emailThreads, ({ many }) => ({
  messages: many(emailMessages),
}));

export const emailMessagesRelations = relations(emailMessages, ({ one }) => ({
  thread: one(emailThreads, { fields: [emailMessages.threadId], references: [emailThreads.id] }),
}));

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type ConversationMember = typeof conversationMembers.$inferSelect;
export type NewConversationMember = typeof conversationMembers.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type Read = typeof reads.$inferSelect;
export type NewRead = typeof reads.$inferInsert;
export type EmailThread = typeof emailThreads.$inferSelect;
export type NewEmailThread = typeof emailThreads.$inferInsert;
export type EmailMessage = typeof emailMessages.$inferSelect;
export type NewEmailMessage = typeof emailMessages.$inferInsert;

/** A typed reference embedded in `messages.ref`. */
export interface MessageRef {
  type: 'employee' | 'shift' | 'leave' | 'document' | 'candidate' | 'store';
  id: string;
  label?: string;
}
