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
import { CreateFactoryDto, UpdateFactoryDto } from './dto/workplace.dto';
import { FactoriesService } from './factories.service';

@ApiTags('factories')
@ApiBearerAuth()
@Controller('factories')
@UseGuards(TenantGuard, PermissionGuard)
@RequirePermission('factories')
export class FactoriesController {
  constructor(private readonly factories: FactoriesService) {}

  @Get()
  list(@CompanyId() companyId: string) {
    return this.factories.list(companyId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('owner', 'hr')
  create(@CompanyId() companyId: string, @Body() dto: CreateFactoryDto) {
    return this.factories.create(companyId, dto);
  }

  @Get(':id')
  get(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.factories.get(companyId, id);
  }

  @Get(':id/analytics')
  analytics(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.factories.analytics(companyId, id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('owner', 'hr')
  update(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFactoryDto,
  ) {
    return this.factories.update(companyId, id, dto);
  }

  @Post(':id/archive')
  @UseGuards(RolesGuard)
  @Roles('owner', 'hr')
  archive(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.factories.archive(companyId, id);
  }
}
