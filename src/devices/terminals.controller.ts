import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CompanyId } from '../common/decorators/company-id.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { PermissionGuard } from '../permissions/permission.guard';
import { DevicesService } from './devices.service';
import { CreateTerminalDto } from './dto/device.dto';

const MANAGER_ROLES = ['owner', 'hr', 'area_manager', 'store_manager'] as const;

@ApiTags('terminals')
@ApiBearerAuth()
@Controller('terminals')
@UseGuards(TenantGuard, PermissionGuard)
@RequirePermission('attendance')
export class TerminalsController {
  constructor(private readonly devices: DevicesService) {}

  @Get()
  list(@CompanyId() companyId: string) {
    return this.devices.listTerminals(companyId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(...MANAGER_ROLES)
  create(@CompanyId() companyId: string, @Body() dto: CreateTerminalDto) {
    return this.devices.createTerminal(companyId, dto);
  }

  @Get(':id/qr')
  qr(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.devices.getQr(companyId, id);
  }

  @Post(':id/authorize')
  @UseGuards(RolesGuard)
  @Roles(...MANAGER_ROLES)
  authorize(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.devices.authorizeTerminal(companyId, id);
  }

  @Post(':id/block')
  @UseGuards(RolesGuard)
  @Roles(...MANAGER_ROLES)
  block(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.devices.blockTerminal(companyId, id);
  }
}
