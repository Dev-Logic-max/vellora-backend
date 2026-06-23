import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
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
import { AttendanceService } from './attendance.service';
import {
  ClockInDto,
  CreateCorrectionDto,
  ListLogsDto,
  PunchDto,
  ResolveAnomalyDto,
  SyncBatchDto,
} from './dto/attendance.dto';

const MANAGER_ROLES = ['owner', 'hr', 'area_manager', 'store_manager'] as const;

@ApiTags('attendance')
@ApiBearerAuth()
@Controller('attendance')
@UseGuards(TenantGuard, PermissionGuard)
@RequirePermission('attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get('logs')
  logs(@CompanyId() companyId: string, @Query() query: ListLogsDto) {
    return this.attendance.listLogs(companyId, query);
  }

  @Get('logs/:id')
  log(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.attendance.getLog(companyId, id);
  }

  @Delete('logs/:id')
  @UseGuards(RolesGuard)
  @Roles(...MANAGER_ROLES)
  deleteLog(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.attendance.deleteLog(companyId, id);
  }

  @Get('export')
  @UseGuards(PlanGuard)
  @RequireEntitlement('attendance.advanced')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="attendance.csv"')
  export(@CompanyId() companyId: string, @Query() query: ListLogsDto) {
    return this.attendance.exportCsv(companyId, query);
  }

  // ── clock surface ──────────────────────────────────────────────────────────
  @Post('clock-in')
  clockIn(@CompanyId() companyId: string, @Body() dto: ClockInDto) {
    return this.attendance.clockIn(companyId, dto);
  }

  @Post('clock-out')
  clockOut(@CompanyId() companyId: string, @Body() dto: PunchDto) {
    return this.attendance.clockOut(companyId, dto);
  }

  @Post('break/start')
  breakStart(@CompanyId() companyId: string, @Body() dto: PunchDto) {
    return this.attendance.breakStart(companyId, dto);
  }

  @Post('break/end')
  breakEnd(@CompanyId() companyId: string, @Body() dto: PunchDto) {
    return this.attendance.breakEnd(companyId, dto);
  }

  @Post('sync')
  sync(@CompanyId() companyId: string, @Body() dto: SyncBatchDto) {
    return this.attendance.sync(companyId, dto);
  }

  // ── anomalies ────────────────────────────────────────────────────────────────
  @Get('anomalies')
  anomalies(@CompanyId() companyId: string, @Query('status') status?: string) {
    return this.attendance.listAnomalies(companyId, status as never);
  }

  @Post('anomalies/:id/resolve')
  @UseGuards(RolesGuard)
  @Roles(...MANAGER_ROLES)
  resolveAnomaly(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveAnomalyDto,
  ) {
    return this.attendance.resolveAnomaly(companyId, id, dto);
  }

  // ── corrections ──────────────────────────────────────────────────────────────
  @Get('corrections')
  corrections(@CompanyId() companyId: string, @Query('status') status?: string) {
    return this.attendance.listCorrections(companyId, status as never);
  }

  @Post(':logId/corrections')
  requestCorrection(
    @CompanyId() companyId: string,
    @Param('logId', ParseUUIDPipe) logId: string,
    @Body() dto: CreateCorrectionDto,
  ) {
    return this.attendance.requestCorrection(companyId, logId, dto);
  }

  @Post('corrections/:id/approve')
  @UseGuards(RolesGuard)
  @Roles(...MANAGER_ROLES)
  approveCorrection(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.attendance.approveCorrection(companyId, id);
  }

  @Post('corrections/:id/reject')
  @UseGuards(RolesGuard)
  @Roles(...MANAGER_ROLES)
  rejectCorrection(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.attendance.rejectCorrection(companyId, id);
  }
}
