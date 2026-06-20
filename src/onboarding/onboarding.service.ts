import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import type { OnboardingAssignment, Task, TaskGroup } from '../database/schema';
import type {
  AssignDto,
  CreateGroupDto,
  CreateTaskDto,
  ListAssignmentsDto,
  ReorderTasksDto,
  SetAssignmentDto,
  UpdateGroupDto,
  UpdateTaskDto,
} from './dto/onboarding.dto';
import { OnboardingRepository } from './onboarding.repository';

/** Tenant-scoped onboarding checklists: templates + per-employee assignments + progress. */
@Injectable()
export class OnboardingService {
  constructor(
    private readonly repo: OnboardingRepository,
    private readonly tenant: TenantContextService,
  ) {}

  private scopedStoreIds(): string[] | null {
    const user = this.tenant.get()?.user;
    if (!user) return [];
    if (user.role === 'area_manager' || user.role === 'store_manager') return user.scopeIds ?? [];
    return null;
  }

  private currentUserId(): string | undefined {
    return this.tenant.get()?.user.userId;
  }

  // ── template ────────────────────────────────────────────────────────────────
  listGroups(companyId: string) {
    return this.repo.listGroups(companyId);
  }

  createGroup(companyId: string, dto: CreateGroupDto): Promise<TaskGroup> {
    return this.repo.createGroup(companyId, { companyId, ...dto });
  }

  updateGroup(companyId: string, id: string, dto: UpdateGroupDto): Promise<TaskGroup> {
    return this.repo.updateGroup(companyId, id, dto);
  }

  async deleteGroup(companyId: string, id: string): Promise<{ ok: true }> {
    await this.repo.deleteGroup(companyId, id);
    return { ok: true };
  }

  createTask(companyId: string, dto: CreateTaskDto): Promise<Task> {
    return this.repo.createTask(companyId, { companyId, ...dto });
  }

  updateTask(companyId: string, id: string, dto: UpdateTaskDto): Promise<Task> {
    return this.repo.updateTask(companyId, id, dto);
  }

  async deleteTask(companyId: string, id: string): Promise<{ ok: true }> {
    await this.repo.deleteTask(companyId, id);
    return { ok: true };
  }

  async reorderTasks(companyId: string, dto: ReorderTasksDto): Promise<{ ok: true }> {
    await this.repo.reorderTasks(companyId, dto.items);
    return { ok: true };
  }

  // ── assignment ────────────────────────────────────────────────────────────────
  /** Assign template (or selected) tasks to one/many employees; optionally skip dupes. */
  async assign(companyId: string, dto: AssignDto): Promise<{ created: number }> {
    const allTasks = await this.repo.listTasks(companyId);
    const taskIds = dto.taskIds?.length
      ? allTasks.filter((t) => dto.taskIds!.includes(t.id)).map((t) => t.id)
      : allTasks.map((t) => t.id);

    let existing = new Set<string>();
    if (dto.onlyMissing) {
      const pairs = await this.repo.existingPairs(companyId, dto.employeeIds);
      existing = new Set(pairs.map((p) => `${p.employeeId}:${p.taskId}`));
    }

    const rows = [];
    for (const employeeId of dto.employeeIds) {
      for (const taskId of taskIds) {
        if (existing.has(`${employeeId}:${taskId}`)) continue;
        rows.push({ companyId, employeeId, taskId, status: 'pending' as const });
      }
    }
    const created = await this.repo.insertAssignments(companyId, rows);
    return { created };
  }

  listAssignments(companyId: string, dto: ListAssignmentsDto): Promise<OnboardingAssignment[]> {
    return this.repo.listAssignments(companyId, dto.employeeId);
  }

  /** Progress rollup per employee — completion % across their assigned tasks. */
  async overview(companyId: string) {
    const assignments = await this.repo.listAssignments(companyId);
    const scope = this.scopedStoreIds();
    const byEmployee = new Map<
      string,
      { employee: unknown; total: number; done: number; stages: Record<string, number> }
    >();
    for (const a of assignments) {
      const emp = (a as OnboardingAssignment & { employee?: { primaryStoreId?: string } }).employee;
      if (scope && emp?.primaryStoreId && !scope.includes(emp.primaryStoreId)) continue;
      const key = a.employeeId;
      const entry = byEmployee.get(key) ?? {
        employee: emp,
        total: 0,
        done: 0,
        stages: {},
      };
      entry.total += 1;
      if (a.status === 'done') entry.done += 1;
      byEmployee.set(key, entry);
    }
    const rows = [...byEmployee.entries()].map(([employeeId, v]) => ({
      employeeId,
      employee: v.employee,
      total: v.total,
      done: v.done,
      progress: v.total ? Math.round((v.done / v.total) * 100) : 0,
    }));
    return {
      employees: rows,
      kpis: {
        inProgress: rows.filter((r) => r.progress > 0 && r.progress < 100).length,
        completed: rows.filter((r) => r.progress === 100).length,
        notStarted: rows.filter((r) => r.progress === 0).length,
      },
    };
  }

  async setAssignment(
    companyId: string,
    id: string,
    dto: SetAssignmentDto,
  ): Promise<OnboardingAssignment> {
    const existing = await this.repo.findAssignment(companyId, id);
    if (!existing) throw new NotFoundException('Assignment not found.');
    const emp = (existing as OnboardingAssignment & { employee?: { primaryStoreId?: string } })
      .employee;
    const scope = this.scopedStoreIds();
    if (scope && emp?.primaryStoreId && !scope.includes(emp.primaryStoreId)) {
      throw new ForbiddenException('That employee is outside your scope.');
    }
    return this.repo.updateAssignment(companyId, id, {
      status: dto.status,
      completedBy: dto.status === 'done' ? this.currentUserId() : null,
      completedAt: dto.status === 'done' ? new Date() : null,
    });
  }
}
