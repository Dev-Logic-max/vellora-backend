import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CompanyId } from '../common/decorators/company-id.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { EntitlementsService, type Entitlements } from './entitlements.service';

@ApiTags('entitlements')
@ApiBearerAuth()
@Controller('entitlements')
@UseGuards(TenantGuard)
export class EntitlementsController {
  constructor(private readonly entitlementsService: EntitlementsService) {}

  @Get()
  get(@CompanyId() companyId: string): Promise<Entitlements> {
    return this.entitlementsService.getEntitlements(companyId);
  }
}
