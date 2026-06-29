import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
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
  ActivityQueryDto,
  CreateActivityDto,
  CreateStoreDto,
  UpdateActivityDto,
  UpdateHoursDto,
  UpdateStoreDto,
} from './dto/store.dto';
import { Query } from '@nestjs/common';
import { StoresService } from './stores.service';

@ApiTags('stores')
@ApiBearerAuth()
@Controller('stores')
@UseGuards(TenantGuard, PermissionGuard)
@RequirePermission('stores')
export class StoresController {
  constructor(private readonly storesService: StoresService) {}

  @Get()
  list(@CompanyId() companyId: string) {
    return this.storesService.list(companyId);
  }

  /** Company-wide activity overlay for the scheduling calendar (store/month filters). */
  @Get('activities/all')
  allActivities(@CompanyId() companyId: string, @Query() query: ActivityQueryDto) {
    return this.storesService.listCompanyActivities(companyId, query);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('owner', 'hr')
  create(@CompanyId() companyId: string, @Body() dto: CreateStoreDto) {
    return this.storesService.create(companyId, dto);
  }

  @Get(':id')
  get(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.storesService.get(companyId, id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('owner', 'hr')
  update(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStoreDto,
  ) {
    return this.storesService.update(companyId, id, dto);
  }

  @Post(':id/archive')
  @UseGuards(RolesGuard)
  @Roles('owner', 'hr')
  archive(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.storesService.archive(companyId, id);
  }

  @Get(':id/hours')
  getHours(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.storesService.getHours(companyId, id);
  }

  @Put(':id/hours')
  @UseGuards(RolesGuard)
  @Roles('owner', 'hr', 'store_manager', 'area_manager')
  setHours(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateHoursDto,
  ) {
    return this.storesService.setHours(companyId, id, dto);
  }

  @Get(':id/activities')
  activities(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.storesService.listActivities(companyId, id);
  }

  @Post(':id/activities')
  @UseGuards(RolesGuard)
  @Roles('owner', 'hr', 'store_manager', 'area_manager')
  createActivity(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateActivityDto,
  ) {
    return this.storesService.createActivity(companyId, id, dto);
  }

  @Patch(':id/activities/:activityId')
  @UseGuards(RolesGuard)
  @Roles('owner', 'hr', 'store_manager', 'area_manager')
  updateActivity(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('activityId', ParseUUIDPipe) activityId: string,
    @Body() dto: UpdateActivityDto,
  ) {
    return this.storesService.updateActivity(companyId, id, activityId, dto);
  }

  @Post(':id/activities/:activityId/delete')
  @UseGuards(RolesGuard)
  @Roles('owner', 'hr', 'store_manager', 'area_manager')
  deleteActivity(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('activityId', ParseUUIDPipe) activityId: string,
  ) {
    return this.storesService.deleteActivity(companyId, id, activityId);
  }

  /** Paid module — blocked unless the plan unlocks store finances. */
  @Get(':id/finances')
  @UseGuards(PlanGuard)
  @RequireEntitlement('store.finances')
  finances(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.storesService.finances(companyId, id);
  }

  /** Store analytics (mock revenue/profit/visitors/peak hours — POS placeholder). */
  @Get(':id/analytics')
  analytics(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.storesService.analytics(companyId, id);
  }

  /** Real shift coverage for this store this week. */
  @Get(':id/shift-coverage')
  shiftCoverage(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.storesService.shiftCoverage(companyId, id);
  }

  /** Sibling stores in the same company (head-store hierarchy). */
  @Get(':id/siblings')
  siblings(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.storesService.siblings(companyId, id);
  }
}
