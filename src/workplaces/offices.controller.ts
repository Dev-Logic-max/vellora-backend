import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { CreateOfficeDto, UpdateOfficeDto } from './dto/workplace.dto';
import { OfficesService } from './offices.service';

@ApiTags('offices')
@ApiBearerAuth()
@Controller('offices')
@UseGuards(TenantGuard, PermissionGuard)
@RequirePermission('offices')
export class OfficesController {
  constructor(private readonly offices: OfficesService) {}

  @Get()
  list(@CompanyId() companyId: string) {
    return this.offices.list(companyId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('owner', 'hr')
  create(@CompanyId() companyId: string, @Body() dto: CreateOfficeDto) {
    return this.offices.create(companyId, dto);
  }

  @Get(':id')
  get(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.offices.get(companyId, id);
  }

  @Get(':id/analytics')
  analytics(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.offices.analytics(companyId, id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('owner', 'hr')
  update(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOfficeDto,
  ) {
    return this.offices.update(companyId, id, dto);
  }

  @Post(':id/archive')
  @UseGuards(RolesGuard)
  @Roles('owner', 'hr')
  archive(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.offices.archive(companyId, id);
  }
}
