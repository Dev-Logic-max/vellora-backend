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
