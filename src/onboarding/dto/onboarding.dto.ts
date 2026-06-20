import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ONBOARDING_ASSIGNMENT_STATUSES, ONBOARDING_STAGES } from '../../database/schema/enums';

// ── template: groups + tasks ──────────────────────────────────────────────────
export const createGroupSchema = z.object({
  name: z.string().min(1).max(120),
  stage: z.enum(ONBOARDING_STAGES).optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
});
export class CreateGroupDto extends createZodDto(createGroupSchema) {}

export const updateGroupSchema = createGroupSchema.partial();
export class UpdateGroupDto extends createZodDto(updateGroupSchema) {}

export const createTaskSchema = z.object({
  groupId: z.uuid(),
  title: z.string().min(1).max(160),
  description: z.string().max(1000).optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
});
export class CreateTaskDto extends createZodDto(createTaskSchema) {}

export const updateTaskSchema = createTaskSchema.partial().omit({ groupId: true });
export class UpdateTaskDto extends createZodDto(updateTaskSchema) {}

/** Reorder tasks within/across groups (dnd-kit drop). */
export const reorderTasksSchema = z.object({
  items: z
    .array(z.object({ id: z.uuid(), groupId: z.uuid(), sortOrder: z.number().int().min(0) }))
    .max(500),
});
export class ReorderTasksDto extends createZodDto(reorderTasksSchema) {}

// ── assignment ────────────────────────────────────────────────────────────────
export const assignSchema = z.object({
  /** One employee, or many for bulk. */
  employeeIds: z.array(z.uuid()).min(1).max(500),
  /** Limit to specific tasks; omit to assign the whole template. */
  taskIds: z.array(z.uuid()).optional(),
  /** Only create rows that don't already exist (assign-missing). */
  onlyMissing: z.boolean().optional(),
});
export class AssignDto extends createZodDto(assignSchema) {}

export const setAssignmentSchema = z.object({
  status: z.enum(ONBOARDING_ASSIGNMENT_STATUSES),
});
export class SetAssignmentDto extends createZodDto(setAssignmentSchema) {}

export const listAssignmentsSchema = z.object({
  employeeId: z.uuid().optional(),
});
export class ListAssignmentsDto extends createZodDto(listAssignmentsSchema) {}
