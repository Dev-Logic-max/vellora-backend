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
import { RequireEntitlement } from '../common/decorators/require-entitlement.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { PermissionGuard } from '../permissions/permission.guard';
import { PlanGuard } from '../entitlements/plan.guard';
import {
  ApplyTemplateDto,
  AssignShiftDto,
  CopyWeekDto,
  CoverageQueryDto,
  CreateShiftDto,
  CreateTemplateDto,
  ListShiftsDto,
  PublishShiftsDto,
  SetCoverageTargetsDto,
  UpdateShiftDto,
} from './dto/shift.dto';
import { SchedulingService } from './scheduling.service';

const MANAGER_ROLES = ['owner', 'hr', 'area_manager', 'store_manager'] as const;

@ApiTags('scheduling')
@ApiBearerAuth()
@Controller('scheduling')
@UseGuards(TenantGuard, PermissionGuard)
@RequirePermission('shifts')
export class SchedulingController {
  constructor(private readonly scheduling: SchedulingService) {}

  @Get('shifts')
  list(@CompanyId() companyId: string, @Query() query: ListShiftsDto) {
    return this.scheduling.list(companyId, query);
  }

  @Post('shifts')
  @UseGuards(RolesGuard)
  @Roles(...MANAGER_ROLES)
  create(@CompanyId() companyId: string, @Body() dto: CreateShiftDto) {
    return this.scheduling.create(companyId, dto);
  }

  @Get('shifts/:id')
  get(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.scheduling.get(companyId, id);
  }

  @Patch('shifts/:id')
  @UseGuards(RolesGuard)
  @Roles(...MANAGER_ROLES)
  update(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateShiftDto,
  ) {
    return this.scheduling.update(companyId, id, dto);
  }

  @Post('shifts/:id/assign')
  @UseGuards(RolesGuard)
  @Roles(...MANAGER_ROLES)
  assign(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignShiftDto,
  ) {
    return this.scheduling.assign(companyId, id, dto);
  }

  @Post('shifts/:id/approve')
  @UseGuards(RolesGuard)
  @Roles('owner', 'hr', 'area_manager')
  approve(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.scheduling.approve(companyId, id);
  }

  @Post('shifts/:id/cancel')
  @UseGuards(RolesGuard)
  @Roles(...MANAGER_ROLES)
  cancel(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.scheduling.cancel(companyId, id);
  }

  @Delete('shifts/:id')
  @UseGuards(RolesGuard)
  @Roles('owner', 'hr', 'area_manager')
  remove(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.scheduling.remove(companyId, id);
  }

  @Post('publish')
  @UseGuards(RolesGuard)
  @Roles('owner', 'hr', 'area_manager')
  publish(@CompanyId() companyId: string, @Body() dto: PublishShiftsDto) {
    return this.scheduling.publish(companyId, dto);
  }

  // ── templates ─────────────────────────────────────────────────────────────
  @Get('templates')
  templates(@CompanyId() companyId: string) {
    return this.scheduling.listTemplates(companyId);
  }

  @Post('templates')
  @UseGuards(RolesGuard)
  @Roles(...MANAGER_ROLES)
  createTemplate(@CompanyId() companyId: string, @Body() dto: CreateTemplateDto) {
    return this.scheduling.createTemplate(companyId, dto);
  }

  @Post('templates/:id/apply')
  @UseGuards(RolesGuard)
  @Roles(...MANAGER_ROLES)
  applyTemplate(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApplyTemplateDto,
  ) {
    return this.scheduling.applyTemplate(companyId, id, dto);
  }

  @Post('copy-week')
  @UseGuards(RolesGuard)
  @Roles(...MANAGER_ROLES)
  copyWeek(@CompanyId() companyId: string, @Body() dto: CopyWeekDto) {
    return this.scheduling.copyWeek(companyId, dto);
  }

  // ── coverage & suggestions ────────────────────────────────────────────────
  @Get('coverage')
  coverage(@CompanyId() companyId: string, @Query() query: CoverageQueryDto) {
    return this.scheduling.coverage(companyId, query);
  }

  @Post('coverage-targets')
  @UseGuards(RolesGuard)
  @Roles(...MANAGER_ROLES)
  setCoverageTargets(@CompanyId() companyId: string, @Body() dto: SetCoverageTargetsDto) {
    return this.scheduling.setCoverageTargets(companyId, dto);
  }

  /** Paid: demand-aware staffing suggestions (gated by plan entitlement). */
  @Get('suggestions')
  @UseGuards(PlanGuard)
  @RequireEntitlement('scheduling.suggestions')
  suggestions(@CompanyId() companyId: string, @Query() query: CoverageQueryDto) {
    return this.scheduling.suggestions(companyId, query);
  }
}
