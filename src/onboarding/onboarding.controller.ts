import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CompanyId } from '../common/decorators/company-id.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { PermissionGuard } from '../permissions/permission.guard';
import {
  AssignDto,
  CreateGroupDto,
  CreateTaskDto,
  ListAssignmentsDto,
  ReorderTasksDto,
  SetAssignmentDto,
  UpdateGroupDto,
  UpdateTaskDto,
} from './dto/onboarding.dto';
import { OnboardingService } from './onboarding.service';

const MANAGER_ROLES = ['owner', 'hr', 'area_manager', 'store_manager'] as const;
const ADMIN_ROLES = ['owner', 'hr'] as const;

@ApiTags('onboarding')
@ApiBearerAuth()
@Controller('onboarding')
@UseGuards(TenantGuard, PermissionGuard)
@RequirePermission('onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  // ── overview + assignments ──────────────────────────────────────────────────
  @Get('overview')
  overview(@CompanyId() companyId: string) {
    return this.onboarding.overview(companyId);
  }

  @Get('assignments')
  assignments(@CompanyId() companyId: string, @Query() query: ListAssignmentsDto) {
    return this.onboarding.listAssignments(companyId, query);
  }

  @Post('assign')
  @UseGuards(RolesGuard)
  @Roles(...MANAGER_ROLES)
  assign(@CompanyId() companyId: string, @Body() dto: AssignDto) {
    return this.onboarding.assign(companyId, dto);
  }

  @Patch('assignments/:id')
  @UseGuards(RolesGuard)
  @Roles(...MANAGER_ROLES)
  setAssignment(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetAssignmentDto,
  ) {
    return this.onboarding.setAssignment(companyId, id, dto);
  }

  // ── template: groups ────────────────────────────────────────────────────────
  @Get('groups')
  groups(@CompanyId() companyId: string) {
    return this.onboarding.listGroups(companyId);
  }

  @Post('groups')
  @UseGuards(RolesGuard)
  @Roles(...ADMIN_ROLES)
  createGroup(@CompanyId() companyId: string, @Body() dto: CreateGroupDto) {
    return this.onboarding.createGroup(companyId, dto);
  }

  @Patch('groups/:id')
  @UseGuards(RolesGuard)
  @Roles(...ADMIN_ROLES)
  updateGroup(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.onboarding.updateGroup(companyId, id, dto);
  }

  @Delete('groups/:id')
  @UseGuards(RolesGuard)
  @Roles(...ADMIN_ROLES)
  deleteGroup(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.onboarding.deleteGroup(companyId, id);
  }

  // ── template: tasks ─────────────────────────────────────────────────────────
  @Post('tasks')
  @UseGuards(RolesGuard)
  @Roles(...ADMIN_ROLES)
  createTask(@CompanyId() companyId: string, @Body() dto: CreateTaskDto) {
    return this.onboarding.createTask(companyId, dto);
  }

  @Post('tasks/reorder')
  @UseGuards(RolesGuard)
  @Roles(...ADMIN_ROLES)
  reorder(@CompanyId() companyId: string, @Body() dto: ReorderTasksDto) {
    return this.onboarding.reorderTasks(companyId, dto);
  }

  @Patch('tasks/:id')
  @UseGuards(RolesGuard)
  @Roles(...ADMIN_ROLES)
  updateTask(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.onboarding.updateTask(companyId, id, dto);
  }

  @Delete('tasks/:id')
  @UseGuards(RolesGuard)
  @Roles(...ADMIN_ROLES)
  deleteTask(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.onboarding.deleteTask(companyId, id);
  }
}
