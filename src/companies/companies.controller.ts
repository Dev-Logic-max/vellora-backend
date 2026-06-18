import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CompanyId } from '../common/decorators/company-id.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import type { Company } from '../database/schema';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

/**
 * Thin controller — delegates to CompaniesService. Guarded by the global auth
 * guard; tenant-scoped routes add TenantGuard (so `companyId` is present) and
 * role checks where mutation is owner-only.
 */
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

  @Get('current')
  @UseGuards(TenantGuard)
  @ApiOperation({ summary: "The caller's active company (RLS-scoped)" })
  current(@CompanyId() companyId: string): Promise<Company> {
    return this.companiesService.findCurrent(companyId);
  }

  @Patch('current')
  @UseGuards(TenantGuard, RolesGuard)
  @Roles('owner')
  @ApiOperation({ summary: "Update the caller's active company (owner only)" })
  update(@CompanyId() companyId: string, @Body() dto: UpdateCompanyDto): Promise<Company> {
    return this.companiesService.updateCurrent(companyId, dto);
  }
}
