import {
  Body,
  Controller,
  Get,
  Header,
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
import { TenantGuard } from '../common/tenant/tenant.guard';
import { PlanGuard } from '../entitlements/plan.guard';
import { PermissionGuard } from '../permissions/permission.guard';
import {
  CreateJobDto,
  MoveCandidateDto,
  ScheduleInterviewDto,
  UpdateCandidateDto,
  UpdateJobDto,
} from './dto/recruiting.dto';
import { RecruitingService } from './recruiting.service';

/**
 * Internal recruiting (09-recruiting). Gated by the `recruiting` plan
 * entitlement (Growth+) ∧ the `recruiting` module permission ∧ tenant scope.
 */
@ApiTags('recruiting')
@ApiBearerAuth()
@Controller('recruiting')
@UseGuards(TenantGuard, PermissionGuard, PlanGuard)
@RequirePermission('recruiting')
@RequireEntitlement('recruiting')
export class RecruitingController {
  constructor(private readonly recruiting: RecruitingService) {}

  // ── jobs ────────────────────────────────────────────────────────────────────
  @Get('jobs')
  listJobs(@CompanyId() companyId: string) {
    return this.recruiting.listJobs(companyId);
  }

  @Post('jobs')
  createJob(@CompanyId() companyId: string, @Body() dto: CreateJobDto) {
    return this.recruiting.createJob(companyId, dto);
  }

  @Get('jobs/:id')
  getJob(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.recruiting.getJob(companyId, id);
  }

  @Patch('jobs/:id')
  updateJob(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateJobDto,
  ) {
    return this.recruiting.updateJob(companyId, id, dto);
  }

  @Post('jobs/:id/publish')
  publish(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.recruiting.setPublished(companyId, id, true);
  }

  @Post('jobs/:id/unpublish')
  unpublish(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.recruiting.setPublished(companyId, id, false);
  }

  // ── candidates ────────────────────────────────────────────────────────────────
  @Get('candidates')
  listCandidates(@CompanyId() companyId: string, @Query('jobId') jobId?: string) {
    return this.recruiting.listCandidates(companyId, jobId);
  }

  @Get('candidates/:id')
  getCandidate(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.recruiting.getCandidate(companyId, id);
  }

  @Get('candidates/:id/resume')
  resume(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.recruiting.resumeUrl(companyId, id);
  }

  @Post('candidates/:id/move')
  move(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MoveCandidateDto,
  ) {
    return this.recruiting.moveCandidate(companyId, id, dto);
  }

  @Patch('candidates/:id')
  updateCandidate(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCandidateDto,
  ) {
    return this.recruiting.updateCandidate(companyId, id, dto);
  }

  @Post('candidates/:id/score')
  score(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.recruiting.scoreCandidate(companyId, id);
  }

  // ── interviews ───────────────────────────────────────────────────────────────
  @Post('interviews')
  schedule(@CompanyId() companyId: string, @Body() dto: ScheduleInterviewDto) {
    return this.recruiting.scheduleInterview(companyId, dto);
  }

  @Get('interviews/:id/ics')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="interview.ics"')
  ics(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.recruiting.getIcs(companyId, id);
  }

  // ── AI ───────────────────────────────────────────────────────────────────────
  @Post('ai/draft-jd')
  draftJd(@Body() body: { title: string; notes?: string }) {
    return this.recruiting.draftJobDescription({ title: body.title, notes: body.notes });
  }

  // ── insights ──────────────────────────────────────────────────────────────────
  @Get('insights')
  insights(@CompanyId() companyId: string) {
    return this.recruiting.insights(companyId);
  }
}
