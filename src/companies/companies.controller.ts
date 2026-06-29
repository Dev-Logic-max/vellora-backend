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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CompanyId } from '../common/decorators/company-id.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { PermissionGuard } from '../permissions/permission.guard';
import type { Company } from '../database/schema';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

@ApiTags('companies')
@ApiBearerAuth()
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a company and become its owner (self-serve signup)' })
  create(@Body() dto: CreateCompanyDto, @CurrentUser('userId') userId: string): Promise<Company> {
    return this.companiesService.createWithOwner(dto, userId);
  }

  /** Companies the caller belongs to — or ALL companies for platform operators. */
  @Get()
  list(
    @CurrentUser('userId') userId: string,
    @CurrentUser('platformRole') platformRole: string | null | undefined,
  ) {
    return this.companiesService.listForUser(userId, Boolean(platformRole));
  }

  @Get('current')
  @UseGuards(TenantGuard)
  @ApiOperation({ summary: "The caller's active company (RLS-scoped)" })
  current(@CompanyId() companyId: string): Promise<Company> {
    return this.companiesService.findCurrent(companyId);
  }

  @Patch('current')
  @UseGuards(TenantGuard, RolesGuard)
  @Roles('owner')
  update(
    @CompanyId() companyId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdateCompanyDto,
  ): Promise<Company> {
    return this.companiesService.update(companyId, userId, dto);
  }

  @Get(':id')
  getById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('platformRole') platformRole: string | null | undefined,
  ) {
    return this.companiesService.getById(id, userId, Boolean(platformRole));
  }

  @Get(':id/usage')
  usage(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('platformRole') platformRole: string | null | undefined,
  ) {
    return this.companiesService.usage(id, userId, Boolean(platformRole));
  }

  @Patch(':id')
  @UseGuards(TenantGuard, PermissionGuard)
  @RequirePermission('companies')
  patch(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdateCompanyDto,
  ) {
    return this.companiesService.update(id, userId, dto);
  }

  @Post(':id/deactivate')
  @UseGuards(TenantGuard, PermissionGuard)
  @RequirePermission('companies')
  deactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('userId') userId: string) {
    return this.companiesService.deactivate(id, userId);
  }
}
