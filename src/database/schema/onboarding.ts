import { relations } from 'drizzle-orm';
import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { employees } from './employees';
import { onboardingAssignmentStatusEnum, onboardingStageEnum } from './enums';
import { users } from './users';

/**
 * Onboarding checklist templates + per-employee assignments (07-onboarding §3).
 * Tenant-scoped + RLS on company_id.
 */
export const taskGroups = pgTable(
  'task_groups',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    stage: onboardingStageEnum('stage').notNull().default('pre_start'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('task_groups_company_id_idx').on(table.companyId)],
);

/** A template task within a group (07-onboarding §3). */
export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id')
      .notNull()
      .references(() => taskGroups.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('tasks_company_id_idx').on(table.companyId),
    index('tasks_group_id_idx').on(table.groupId),
  ],
);

/** A template task assigned to one employee (07-onboarding §3). */
export const onboardingAssignments = pgTable(
  'onboarding_assignments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    status: onboardingAssignmentStatusEnum('status').notNull().default('pending'),
    completedBy: uuid('completed_by').references(() => users.id, { onDelete: 'set null' }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('onboarding_assignments_company_id_idx').on(table.companyId),
    index('onboarding_assignments_employee_id_idx').on(table.employeeId),
  ],
);

export const taskGroupsRelations = relations(taskGroups, ({ many }) => ({
  tasks: many(tasks),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  group: one(taskGroups, { fields: [tasks.groupId], references: [taskGroups.id] }),
  assignments: many(onboardingAssignments),
}));

export const onboardingAssignmentsRelations = relations(onboardingAssignments, ({ one }) => ({
  employee: one(employees, {
    fields: [onboardingAssignments.employeeId],
    references: [employees.id],
  }),
  task: one(tasks, { fields: [onboardingAssignments.taskId], references: [tasks.id] }),
}));

export type TaskGroup = typeof taskGroups.$inferSelect;
export type NewTaskGroup = typeof taskGroups.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type OnboardingAssignment = typeof onboardingAssignments.$inferSelect;
export type NewOnboardingAssignment = typeof onboardingAssignments.$inferInsert;
