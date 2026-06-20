import { Injectable } from '@nestjs/common';
import { asc, eq, inArray } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import {
  onboardingAssignments,
  taskGroups,
  tasks,
  type NewOnboardingAssignment,
  type NewTask,
  type NewTaskGroup,
  type OnboardingAssignment,
  type Task,
  type TaskGroup,
} from '../database/schema';

const EMPLOYEE_COLS = {
  id: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  uniqueCode: true,
  primaryStoreId: true,
} as const;

/** All onboarding Drizzle access, RLS-scoped via DatabaseService.withTenant. */
@Injectable()
export class OnboardingRepository {
  constructor(private readonly db: DatabaseService) {}

  // ── template ────────────────────────────────────────────────────────────────
  listGroups(companyId: string): Promise<(TaskGroup & { tasks: Task[] })[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.taskGroups.findMany({
        orderBy: asc(taskGroups.sortOrder),
        with: { tasks: { orderBy: asc(tasks.sortOrder) } },
      }),
    );
  }

  createGroup(companyId: string, values: NewTaskGroup): Promise<TaskGroup> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx.insert(taskGroups).values(values).returning();
      return row;
    });
  }

  updateGroup(companyId: string, id: string, values: Partial<NewTaskGroup>): Promise<TaskGroup> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx
        .update(taskGroups)
        .set(values)
        .where(eq(taskGroups.id, id))
        .returning();
      return row;
    });
  }

  deleteGroup(companyId: string, id: string): Promise<void> {
    return this.db.withTenant(companyId, async (tx) => {
      await tx.delete(taskGroups).where(eq(taskGroups.id, id));
    });
  }

  listTasks(companyId: string): Promise<Task[]> {
    return this.db.withTenant(companyId, (tx) => tx.query.tasks.findMany({ limit: 1000 }));
  }

  createTask(companyId: string, values: NewTask): Promise<Task> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx.insert(tasks).values(values).returning();
      return row;
    });
  }

  updateTask(companyId: string, id: string, values: Partial<NewTask>): Promise<Task> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx.update(tasks).set(values).where(eq(tasks.id, id)).returning();
      return row;
    });
  }

  deleteTask(companyId: string, id: string): Promise<void> {
    return this.db.withTenant(companyId, async (tx) => {
      await tx.delete(tasks).where(eq(tasks.id, id));
    });
  }

  reorderTasks(
    companyId: string,
    items: { id: string; groupId: string; sortOrder: number }[],
  ): Promise<void> {
    return this.db.withTenant(companyId, async (tx) => {
      for (const it of items) {
        await tx
          .update(tasks)
          .set({ groupId: it.groupId, sortOrder: it.sortOrder })
          .where(eq(tasks.id, it.id));
      }
    });
  }

  // ── assignments ─────────────────────────────────────────────────────────────
  listAssignments(companyId: string, employeeId?: string): Promise<OnboardingAssignment[]> {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.onboardingAssignments.findMany({
        where: employeeId ? eq(onboardingAssignments.employeeId, employeeId) : undefined,
        with: {
          task: { with: { group: true } },
          employee: { columns: EMPLOYEE_COLS },
        },
        limit: 2000,
      }),
    );
  }

  existingPairs(companyId: string, employeeIds: string[]) {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.onboardingAssignments.findMany({
        where: inArray(onboardingAssignments.employeeId, employeeIds),
        columns: { employeeId: true, taskId: true },
      }),
    );
  }

  insertAssignments(companyId: string, values: NewOnboardingAssignment[]): Promise<number> {
    if (!values.length) return Promise.resolve(0);
    return this.db.withTenant(companyId, async (tx) => {
      const rows = await tx.insert(onboardingAssignments).values(values).returning({
        id: onboardingAssignments.id,
      });
      return rows.length;
    });
  }

  findAssignment(companyId: string, id: string) {
    return this.db.withTenant(companyId, (tx) =>
      tx.query.onboardingAssignments.findFirst({
        where: eq(onboardingAssignments.id, id),
        with: { employee: { columns: EMPLOYEE_COLS } },
      }),
    );
  }

  updateAssignment(
    companyId: string,
    id: string,
    values: Partial<NewOnboardingAssignment>,
  ): Promise<OnboardingAssignment> {
    return this.db.withTenant(companyId, async (tx) => {
      const [row] = await tx
        .update(onboardingAssignments)
        .set(values)
        .where(eq(onboardingAssignments.id, id))
        .returning();
      return row;
    });
  }
}
