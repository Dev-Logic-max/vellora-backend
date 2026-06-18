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
import { PlanGuard } from '../entitlements/plan.guard';
import { PermissionGuard } from '../permissions/permission.guard';
import {
  CreateBlackoutDto,
  CreateHolidayDto,
  CreateLeaveTypeDto,
  CreateRequestDto,
  DecisionDto,
  ListBalancesDto,
  ListHolidaysDto,
  ListRequestsDto,
  SetBalanceDto,
  UpdateLeaveTypeDto,
} from './dto/leave.dto';
import { LeaveService } from './leave.service';

const MANAGER_ROLES = ['owner', 'hr', 'area_manager', 'store_manager'] as const;
const ADMIN_ROLES = ['owner', 'hr'] as const;

@ApiTags('leave')
@ApiBearerAuth()
@Controller('leave')
@UseGuards(TenantGuard, PermissionGuard)
@RequirePermission('leave')
export class LeaveController {
  constructor(private readonly leave: LeaveService) {}

  // ── requests ────────────────────────────────────────────────────────────────
  @Get('requests')
  listRequests(@CompanyId() companyId: string, @Query() query: ListRequestsDto) {
    return this.leave.listRequests(companyId, query);
  }

  @Post('requests')
  createRequest(@CompanyId() companyId: string, @Body() dto: CreateRequestDto) {
    return this.leave.createRequest(companyId, dto);
  }

  @Get('requests/:id/conflicts')
  conflicts(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.leave.conflicts(companyId, id);
  }

  @Post('requests/:id/approve')
  @UseGuards(RolesGuard)
  @Roles(...MANAGER_ROLES)
  approve(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecisionDto,
  ) {
    return this.leave.approve(companyId, id, dto);
  }

  @Post('requests/:id/reject')
  @UseGuards(RolesGuard)
  @Roles(...MANAGER_ROLES)
  reject(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecisionDto,
  ) {
    return this.leave.reject(companyId, id, dto);
  }

  @Post('requests/:id/cancel')
  cancel(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.leave.cancel(companyId, id);
  }

  // ── balances ──────────────────────────────────────────────────────────────
  @Get('balances')
  balances(@CompanyId() companyId: string, @Query() query: ListBalancesDto) {
    return this.leave.listBalances(companyId, query);
  }

  @Post('balances')
  @UseGuards(RolesGuard)
  @Roles(...ADMIN_ROLES)
  setBalance(@CompanyId() companyId: string, @Body() dto: SetBalanceDto) {
    return this.leave.setBalance(companyId, dto);
  }

  // ── policies (leave types) ───────────────────────────────────────────────────
  @Get('types')
  types(@CompanyId() companyId: string) {
    return this.leave.listTypes(companyId);
  }

  @Post('types')
  @UseGuards(RolesGuard)
  @Roles(...ADMIN_ROLES)
  createType(@CompanyId() companyId: string, @Body() dto: CreateLeaveTypeDto) {
    return this.leave.createType(companyId, dto);
  }

  @Patch('types/:id')
  @UseGuards(RolesGuard)
  @Roles(...ADMIN_ROLES)
  updateType(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeaveTypeDto,
  ) {
    return this.leave.updateType(companyId, id, dto);
  }

  // ── holidays ──────────────────────────────────────────────────────────────
  @Get('holidays')
  holidays(@CompanyId() companyId: string, @Query() query: ListHolidaysDto) {
    return this.leave.listHolidays(companyId, query);
  }

  @Post('holidays')
  @UseGuards(RolesGuard)
  @Roles(...ADMIN_ROLES)
  createHoliday(@CompanyId() companyId: string, @Body() dto: CreateHolidayDto) {
    return this.leave.createHoliday(companyId, dto);
  }

  @Delete('holidays/:id')
  @UseGuards(RolesGuard)
  @Roles(...ADMIN_ROLES)
  deleteHoliday(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.leave.deleteHoliday(companyId, id);
  }

  // ── blackout dates (paid) ─────────────────────────────────────────────────────
  @Get('blackout-dates')
  blackouts(@CompanyId() companyId: string) {
    return this.leave.listBlackouts(companyId);
  }

  @Post('blackout-dates')
  @UseGuards(RolesGuard, PlanGuard)
  @Roles(...ADMIN_ROLES)
  @RequireEntitlement('leave.advanced')
  createBlackout(@CompanyId() companyId: string, @Body() dto: CreateBlackoutDto) {
    return this.leave.createBlackout(companyId, dto);
  }
}
