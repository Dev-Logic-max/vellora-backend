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
import { CreateTransferDto, ListTransfersDto } from './dto/transfer.dto';
import { TransfersService } from './transfers.service';

const MANAGER_ROLES = ['owner', 'hr', 'area_manager', 'store_manager'] as const;
const APPROVER_ROLES = ['owner', 'hr', 'area_manager'] as const;

// Transfers live under the Employees module gate (12-transfers §4).
@ApiTags('transfers')
@ApiBearerAuth()
@Controller('transfers')
@UseGuards(TenantGuard, PermissionGuard)
@RequirePermission('employees')
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Get()
  list(@CompanyId() companyId: string, @Query() query: ListTransfersDto) {
    return this.transfers.list(companyId, query);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(...MANAGER_ROLES)
  create(@CompanyId() companyId: string, @Body() dto: CreateTransferDto) {
    return this.transfers.create(companyId, dto);
  }

  @Get(':id')
  get(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.transfers.get(companyId, id);
  }

  @Post(':id/approve')
  @UseGuards(RolesGuard)
  @Roles(...APPROVER_ROLES)
  approve(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.transfers.approve(companyId, id);
  }

  @Post(':id/reject')
  @UseGuards(RolesGuard)
  @Roles(...APPROVER_ROLES)
  reject(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.transfers.reject(companyId, id);
  }

  @Post(':id/cancel')
  @UseGuards(RolesGuard)
  @Roles(...MANAGER_ROLES)
  cancel(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.transfers.cancel(companyId, id);
  }
}
