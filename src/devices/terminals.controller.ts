import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
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
import { CreateTerminalDto } from './dto/device.dto';

const MANAGER_ROLES = ['owner', 'hr', 'area_manager', 'store_manager'] as const;
/** Freezing/deleting a store terminal is an owner-only ("super admin") action. */
const OWNER_ONLY = ['owner'] as const;

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

  /** Freeze a terminal without deleting (owner/super-admin) — no punches while inactive. */
  @Post(':id/deactivate')
  @UseGuards(RolesGuard)
  @Roles(...OWNER_ONLY)
  deactivate(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.devices.deactivateTerminal(companyId, id);
  }

  @Post(':id/reactivate')
  @UseGuards(RolesGuard)
  @Roles(...OWNER_ONLY)
  reactivate(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.devices.reactivateTerminal(companyId, id);
  }

  /** Permanently delete a terminal (owner/super-admin) — frees the store. */
  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(...OWNER_ONLY)
  remove(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.devices.deleteTerminal(companyId, id);
  }
}
