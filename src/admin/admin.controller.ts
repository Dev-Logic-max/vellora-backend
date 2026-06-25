import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PlatformGuard } from '../common/guards/platform.guard';
import { PlatformRequestsService } from '../platform-requests/platform-requests.service';
import { RespondRequestDto } from '../platform-requests/dto/platform-requests.dto';
import { AdminService } from './admin.service';
import {
  AdminPermissionsDto,
  AssignPlanDto,
  FlagDto,
  ImpersonateDto,
  OverrideDto,
  PlanUpsertDto,
  SetStatusDto,
} from './dto/admin.dto';

/**
 * Platform console (P9-E, roles-and-access §3). Cross-tenant — gated by
 * PlatformGuard (platform_role). NO TenantGuard: these routes legitimately span
 * tenants. Every mutation is audited in `platform_audit_log`.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(PlatformGuard)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly requests: PlatformRequestsService,
  ) {}

  // ── tenants ─────────────────────────────────────────────────────────────────
  @Get('tenants')
  tenants() {
    return this.admin.listTenants();
  }

  @Get('tenants/:id')
  tenant(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.getTenant(id);
  }

  @Post('tenants/:id/status')
  setStatus(
    @CurrentUser('userId') actor: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetStatusDto,
  ) {
    return this.admin.setStatus(actor, id, dto);
  }

  @Post('tenants/:id/plan')
  assignPlan(
    @CurrentUser('userId') actor: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignPlanDto,
  ) {
    return this.admin.assignPlan(actor, id, dto);
  }

  @Post('tenants/:id/override')
  setOverride(
    @CurrentUser('userId') actor: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OverrideDto,
  ) {
    return this.admin.setOverride(actor, id, dto);
  }

  // ── cross-tenant permissions (super-admin matrix editor) ────────────────────
  @Get('permissions/modules')
  permissionModules() {
    return this.admin.permissionModules();
  }

  @Get('tenants/:id/permissions')
  tenantPermissions(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.getTenantPermissions(id);
  }

  @Put('tenants/:id/permissions')
  setTenantPermissions(
    @CurrentUser('userId') actor: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminPermissionsDto,
  ) {
    return this.admin.setTenantPermissions(actor, id, dto);
  }

  // ── plans (Pricing module) ──────────────────────────────────────────────────
  @Get('plans')
  plans() {
    return this.admin.listPlans();
  }

  @Post('plans')
  createPlan(@CurrentUser('userId') actor: string, @Body() dto: PlanUpsertDto) {
    return this.admin.createPlan(actor, dto);
  }

  @Put('plans/:id')
  updatePlan(
    @CurrentUser('userId') actor: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PlanUpsertDto,
  ) {
    return this.admin.updatePlan(actor, id, dto);
  }

  // ── feature flags ─────────────────────────────────────────────────────────────
  @Get('flags')
  flags() {
    return this.admin.listFlags();
  }

  @Post('flags')
  setFlag(@CurrentUser('userId') actor: string, @Body() dto: FlagDto) {
    return this.admin.setFlag(actor, dto);
  }

  // ── audit log ──────────────────────────────────────────────────────────────
  @Get('audit')
  audit() {
    return this.admin.listAudit();
  }

  // ── impersonation ─────────────────────────────────────────────────────────────
  @Post('impersonate/start')
  startImpersonate(@CurrentUser('userId') actor: string, @Body() dto: ImpersonateDto) {
    return this.admin.startImpersonation(actor, dto.companyId);
  }

  @Post('impersonate/stop')
  stopImpersonate(@CurrentUser('userId') actor: string, @Body() dto: ImpersonateDto) {
    return this.admin.stopImpersonation(actor, dto.companyId);
  }

  // ── platform requests (tenant → platform inbox) ──────────────────────────────
  @Get('requests')
  requestList() {
    return this.requests.listAll();
  }

  @Post('requests/:id/respond')
  respondRequest(
    @CurrentUser('userId') actor: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RespondRequestDto,
  ) {
    return this.requests.respond(actor, id, dto);
  }

  @Post('requests/:id/approve-deletion')
  approveDeletion(@CurrentUser('userId') actor: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.requests.approveDeletion(actor, id);
  }
}
