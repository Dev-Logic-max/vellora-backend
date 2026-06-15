import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import type { Company } from '../database/schema';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

/**
 * Thin controller — delegates to CompaniesService. Guarded by the global auth
 * guard plus TenantGuard (so `req.user.companyId` is guaranteed present).
 */
@Controller('companies')
@UseGuards(TenantGuard)
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  /** The caller's own tenant. */
  @Get('current')
  current(@TenantId() companyId: string): Promise<Company> {
    return this.companiesService.findOne(companyId);
  }

  @Post()
  create(@Body() dto: CreateCompanyDto): Promise<Company> {
    return this.companiesService.create(dto);
  }

  @Get()
  findAll(): Promise<Company[]> {
    return this.companiesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Company> {
    return this.companiesService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCompanyDto): Promise<Company> {
    return this.companiesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.companiesService.remove(id);
  }
}
