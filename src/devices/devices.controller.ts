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
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { PermissionGuard } from '../permissions/permission.guard';
import { DevicesService } from './devices.service';
import { ListDevicesDto, RegisterDeviceDto } from './dto/device.dto';

const MANAGER_ROLES = ['owner', 'hr', 'area_manager', 'store_manager'] as const;

@ApiTags('devices')
@ApiBearerAuth()
@Controller('devices')
@UseGuards(TenantGuard, PermissionGuard)
@RequirePermission('attendance')
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Get()
  list(@CompanyId() companyId: string, @Query() query: ListDevicesDto) {
    return this.devices.listDevices(companyId, query);
  }

  @Post('register')
  @UseGuards(RolesGuard)
  @Roles(...MANAGER_ROLES)
  register(@CompanyId() companyId: string, @Body() dto: RegisterDeviceDto) {
    return this.devices.register(companyId, dto);
  }

  @Post(':id/reset')
  @UseGuards(RolesGuard)
  @Roles(...MANAGER_ROLES)
  reset(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.devices.reset(companyId, id);
  }

  @Post(':id/block')
  @UseGuards(RolesGuard)
  @Roles('owner', 'hr', 'area_manager', 'store_manager')
  block(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.devices.blockDevice(companyId, id);
  }
}
