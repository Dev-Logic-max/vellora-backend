import { Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, type SQL } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { MEMBERSHIP_ROLES, type MembershipRole } from '../database/schema/enums';
import {
  memberships,
  notifPreferences,
  notifications,
  type NewNotifPreference,
  type NewNotification,
  type NotifPreference,
  type Notification,
} from '../database/schema';

/** All notification Drizzle access, RLS-scoped via DatabaseService.withTenant. */
@Injectable()
export class NotificationsRepository {
  constructor(private readonly db: DatabaseService) {}

  list(
    companyId: string,
    userId: string,
    filters: { unread?: boolean; category?: string; priority?: Notification['priority'] },
  ): Promise<Notification[]> {
    const conds: SQL[] = [eq(notifications.userId, userId)];
    if (filters.unread) conds.push(isNull(notifications.readAt));
    if (filters.category) conds.push(eq(notifications.category, filters.category));
    if (filters.priority) conds.push(eq(notifications.priority, filters.priority));
    return this.db.withTenant(companyId, (tx) =>
      tx.query.notifications.findMany({
        where: and(...conds),
        orderBy: desc(notifications.createdAt),
        limit: 100,
      }),
    );
  }

  async unreadCount(companyId: string, userId: string): Promise<number> {
    return this.db.withTenant(companyId, async (tx) => {
      const rows = await tx.query.notifications.findMany({
        where: and(eq(notifications.userId, userId), isNull(notifications.readAt)),
        columns: { id: true },
        limit: 1000,
      });
      return rows.length;
    });
  }

  create(companyId: string, values: NewNotification): Promise<Notification> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx.insert(notifications).values(values).returning();
      return row;
    });
  }

  markRead(companyId: string, userId: string, id: string): Promise<Notification | undefined> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx
        .update(notifications)
        .set({ readAt: new Date() })
        .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
        .returning();
      return row;
    });
  }

  markAllRead(companyId: string, userId: string): Promise<void> {
    return this.db.withTenant(companyId, async (tx) => {
      await tx
        .update(notifications)
        .set({ readAt: new Date() })
        .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
    });
  }

  // ── preferences ──────────────────────────────────────────────────────────
  listPreferences(companyId: string, userId: string): Promise<NotifPreference[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.notifPreferences.findMany({ where: eq(notifPreferences.userId, userId) }),
    );
  }

  findPreference(companyId: string, userId: string, category: string) {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.notifPreferences.findFirst({
        where: and(eq(notifPreferences.userId, userId), eq(notifPreferences.category, category)),
      }),
    );
  }

  upsertPreference(companyId: string, values: NewNotifPreference): Promise<NotifPreference> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx
        .insert(notifPreferences)
        .values(values)
        .onConflictDoUpdate({
          target: [notifPreferences.userId, notifPreferences.category],
          set: {
            inApp: values.inApp,
            email: values.email,
            push: values.push,
            digest: values.digest,
            updatedAt: new Date(),
          },
        })
        .returning();
      return row;
    });
  }

  /** User ids in a company (optionally filtered by role) — for broadcast fan-out. */
  recipientsByRole(companyId: string, role?: string): Promise<string[]> {
    return this.db.withTenant(companyId, async (tx) => {
      const conds: SQL[] = [eq(memberships.status, 'active')];
      if (role && (MEMBERSHIP_ROLES as readonly string[]).includes(role)) {
        conds.push(eq(memberships.role, role as MembershipRole));
      }
      const rows = await tx.query.memberships.findMany({
        where: and(...conds),
        columns: { userId: true },
        limit: 5000,
      });
      return rows.map((r) => r.userId);
    });
  }
}
