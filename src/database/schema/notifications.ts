import { relations, sql } from 'drizzle-orm';
import { boolean, index, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { digestFreqEnum, notifPriorityEnum } from './enums';
import { users } from './users';

/**
 * Unified notifications (11-notifications §3). Realtime in-app via Socket.IO to
 * `user:{id}`, plus email/digest. Tenant-scoped + RLS on company_id; per-user.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
    type: text('type').notNull(),
    priority: notifPriorityEnum('priority').notNull().default('normal'),
    title: text('title').notNull(),
    body: text('body'),
    href: text('href'),
    readAt: timestamp('read_at', { withTimezone: true }),
    /** Which channels were delivered: { in_app, email, push }. */
    channelSent: jsonb('channel_sent')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('notifications_company_id_idx').on(table.companyId),
    index('notifications_user_id_idx').on(table.userId),
    index('notifications_read_at_idx').on(table.readAt),
  ],
);

/** Per-user, per-category channel preferences + digest cadence (11-notifications §3). */
export const notifPreferences = pgTable(
  'notif_preferences',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
    inApp: boolean('in_app').notNull().default(true),
    email: boolean('email').notNull().default(true),
    push: boolean('push').notNull().default(false),
    digest: digestFreqEnum('digest').notNull().default('off'),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique('notif_preferences_user_category_unique').on(table.userId, table.category),
    index('notif_preferences_company_id_idx').on(table.companyId),
  ],
);

/** Reusable subject/body templates per category×type (11-notifications §3). Global reference data. */
export const notifTemplates = pgTable(
  'notif_templates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    category: text('category').notNull(),
    type: text('type').notNull(),
    subject: text('subject').notNull(),
    bodyTemplate: text('body_template').notNull(),
    defaultPriority: notifPriorityEnum('default_priority').notNull().default('normal'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique('notif_templates_category_type_unique').on(table.category, table.type)],
);

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type NotifPreference = typeof notifPreferences.$inferSelect;
export type NewNotifPreference = typeof notifPreferences.$inferInsert;
export type NotifTemplate = typeof notifTemplates.$inferSelect;
export type NewNotifTemplate = typeof notifTemplates.$inferInsert;
