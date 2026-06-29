import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CompanyId } from '../common/decorators/company-id.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { PermissionGuard } from './permission.guard';
import { PermissionsService } from './permissions.service';
import { UpdateModuleVisibilityDto, UpdatePermissionsDto } from './dto/update-permissions.dto';
import { MODULES } from './permission-defaults';
import type { MembershipRole } from '../database/schema/enums';

@ApiTags('permissions')
@ApiBearerAuth()
@Controller()
@UseGuards(TenantGuard, PermissionGuard)
@RequirePermission('settings')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  /** The configurable module catalogue (rows of the matrix). */
  @Get('permissions/modules')
  modules() {
    return { modules: MODULES };
  }

  @Get('permissions')
  matrix(@CompanyId() companyId: string) {
    return this.permissionsService.getMatrix(companyId);
  }

  @Put('permissions')
  update(
    @CompanyId() companyId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdatePermissionsDto,
  ) {
    return this.permissionsService.setOverrides(companyId, userId, dto.entries);
  }

  /**
   * The caller's OWN allowed module keys (sidebar visibility gate). Open to any
   * member — `dashboard` is granted to every role by default, so this overrides
   * the controller's `settings` requirement and reveals only the caller's role.
   */
  @Get('permissions/my-modules')
  @RequirePermission('dashboard')
  myModules(@CompanyId() companyId: string, @CurrentUser('role') role: MembershipRole) {
    return this.permissionsService.allowedModulesFor(companyId, role);
  }

  @Get('module-visibility')
  visibility(@CompanyId() companyId: string) {
    return this.permissionsService.getModuleVisibility(companyId);
  }

  @Put('module-visibility')
  setVisibility(
    @CompanyId() companyId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdateModuleVisibilityDto,
  ) {
    return this.permissionsService.setModuleVisibility(companyId, userId, dto.entries);
  }
}
