import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CompanyId } from '../common/decorators/company-id.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { PlatformRequestsService } from './platform-requests.service';
import {
  CreateRequestDto,
  DeletionRequestDto,
  StoreDeletionRequestDto,
} from './dto/platform-requests.dto';

/**
 * Tenant-facing request endpoints (the company raising a request to the platform).
 * RLS-scoped via TenantGuard. The platform-side (list all / respond / delete) lives
 * on the AdminController under /api/admin/requests behind the PlatformGuard.
 */
@ApiTags('requests')
@ApiBearerAuth()
@Controller('requests')
@UseGuards(TenantGuard)
export class PlatformRequestsController {
  constructor(private readonly requests: PlatformRequestsService) {}

  @Get()
  list(@CompanyId() companyId: string) {
    return this.requests.listForCompany(companyId);
  }

  @Post()
  create(
    @CompanyId() companyId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateRequestDto,
  ) {
    return this.requests.create(companyId, userId, dto);
  }

  @Post('company-deletion')
  requestDeletion(
    @CompanyId() companyId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: DeletionRequestDto,
  ) {
    return this.requests.requestDeletion(companyId, userId, dto);
  }

  @Post('store-deletion')
  requestStoreDeletion(
    @CompanyId() companyId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: StoreDeletionRequestDto,
  ) {
    return this.requests.requestStoreDeletion(companyId, userId, dto);
  }
}
