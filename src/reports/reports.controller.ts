import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CompanyId } from '../common/decorators/company-id.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireEntitlement } from '../common/decorators/require-entitlement.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { PlanGuard } from '../entitlements/plan.guard';
import { PermissionGuard } from '../permissions/permission.guard';
import { CreateReportDefDto, InsightsDto, ReportFiltersDto } from './dto/reports.dto';
import { ReportsService } from './reports.service';

/**
 * Reports & analytics (16-reports). Gated by the `reports` plan entitlement
 * (Growth+) ∧ the `reports` module permission ∧ tenant scope. Aggregates are
 * computed in store tz; heavy/scheduled work runs on BullMQ.
 */
@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
@UseGuards(TenantGuard, PermissionGuard, PlanGuard)
@RequirePermission('reports')
@RequireEntitlement('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  // ── dashboards ────────────────────────────────────────────────────────────────
  @Get('dashboards/:type')
  dashboard(
    @CompanyId() companyId: string,
    @Param('type') type: string,
    @Query() filters: ReportFiltersDto,
  ) {
    return this.reports.dashboard(companyId, type, filters);
  }

  @Get('insights')
  insights(@CompanyId() companyId: string, @Query() query: InsightsDto) {
    return this.reports.insights(companyId, query.storeId);
  }

  // ── saved defs ──────────────────────────────────────────────────────────────
  @Get('defs')
  listDefs(@CompanyId() companyId: string) {
    return this.reports.listDefs(companyId);
  }

  @Post('defs')
  createDef(
    @CompanyId() companyId: string,
    @Body() dto: CreateReportDefDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.reports.createDef(companyId, dto, userId);
  }

  @Get('defs/:id/runs')
  listRuns(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.reports.listRuns(companyId, id);
  }

  @Post('defs/:id/run')
  run(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.reports.run(companyId, id);
  }

  @Get('runs/:id/export')
  exportRun(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.reports.exportUrl(companyId, id);
  }
}
