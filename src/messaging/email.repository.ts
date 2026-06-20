import { Injectable } from '@nestjs/common';
import { asc, desc, eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import {
  emailMessages,
  emailThreads,
  type EmailMessage,
  type EmailThread,
  type NewEmailMessage,
  type NewEmailThread,
} from '../database/schema';

/** Email threads + messages (13-messaging §3). RLS-scoped per tenant. */
@Injectable()
export class EmailRepository {
  constructor(private readonly db: DatabaseService) {}

  listThreads(companyId: string): Promise<EmailThread[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.emailThreads.findMany({
        orderBy: [desc(emailThreads.lastMessageAt), desc(emailThreads.createdAt)],
        limit: 200,
      }),
    );
  }

  findThread(companyId: string, id: string) {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.emailThreads.findFirst({
        where: eq(emailThreads.id, id),
        with: { messages: { orderBy: asc(emailMessages.createdAt) } },
      }),
    );
  }

  createThread(companyId: string, values: NewEmailThread): Promise<EmailThread> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx.insert(emailThreads).values(values).returning();
      return row;
    });
  }

  touchThread(companyId: string, id: string): Promise<void> {
    return this.db.withTenant(companyId, async (tx) => {
      await tx
        .update(emailThreads)
        .set({ lastMessageAt: new Date() })
        .where(eq(emailThreads.id, id));
    });
  }

  createMessage(companyId: string, values: NewEmailMessage): Promise<EmailMessage> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx.insert(emailMessages).values(values).returning();
      return row;
    });
  }

  updateMessage(
    companyId: string,
    id: string,
    values: Partial<NewEmailMessage>,
  ): Promise<EmailMessage> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx
        .update(emailMessages)
        .set(values)
        .where(eq(emailMessages.id, id))
        .returning();
      return row;
    });
  }
}
