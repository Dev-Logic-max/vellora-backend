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
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { DeviceRegistrationService } from './device-registration.service';
import {
  AdminRegisterDto,
  ListRegistrationsDto,
  RegisterMyDeviceDto,
} from './dto/device-registration.dto';

/** Roles that can see/manage everyone's device registrations. */
const MANAGER_ROLES = ['owner', 'hr', 'area_manager', 'store_manager'] as const;

/**
 * Device-registration surface (point 21). `/me` endpoints are reachable by any
 * authenticated employee (so they can self-register); management endpoints are
 * gated to HR/admin/managers. All tenant-scoped via TenantGuard + RLS.
 */
@ApiTags('device-registrations')
@ApiBearerAuth()
@Controller('device-registrations')
@UseGuards(TenantGuard)
export class DeviceRegistrationController {
  constructor(private readonly service: DeviceRegistrationService) {}

  // ── employee self-service ──────────────────────────────────────────────────
  @Get('me')
  myStatus(@CompanyId() companyId: string) {
    return this.service.getMyStatus(companyId);
  }

  @Post('me')
  registerMine(@CompanyId() companyId: string, @Body() dto: RegisterMyDeviceDto) {
    return this.service.registerMine(companyId, dto);
  }

  // ── manager management ─────────────────────────────────────────────────────
  @Get()
  @UseGuards(RolesGuard)
  @Roles(...MANAGER_ROLES)
  list(@CompanyId() companyId: string, @Query() query: ListRegistrationsDto) {
    return this.service.list(companyId, query);
  }

  @Get(':employeeId/history')
  @UseGuards(RolesGuard)
  @Roles(...MANAGER_ROLES)
  history(@CompanyId() companyId: string, @Param('employeeId', ParseUUIDPipe) employeeId: string) {
    return this.service.listHistory(companyId, employeeId);
  }

  @Post('admin')
  @UseGuards(RolesGuard)
  @Roles(...MANAGER_ROLES)
  adminRegister(@CompanyId() companyId: string, @Body() dto: AdminRegisterDto) {
    return this.service.adminRegister(companyId, dto);
  }

  @Post(':id/revoke')
  @UseGuards(RolesGuard)
  @Roles(...MANAGER_ROLES)
  revoke(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.revoke(companyId, id);
  }

  @Post(':id/disable')
  @UseGuards(RolesGuard)
  @Roles(...MANAGER_ROLES)
  disable(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.disable(companyId, id);
  }

  @Post(':id/enable')
  @UseGuards(RolesGuard)
  @Roles(...MANAGER_ROLES)
  enable(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.enable(companyId, id);
  }
}
