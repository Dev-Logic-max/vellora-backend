import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CompanyId } from '../common/decorators/company-id.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PermissionGuard } from '../permissions/permission.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import type { AuditEntry } from '../database/schema';
import { AuditService } from './audit.service';

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit-log')
@UseGuards(TenantGuard, PermissionGuard)
@RequirePermission('settings')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  list(@CompanyId() companyId: string, @Query('limit') limit?: string): Promise<AuditEntry[]> {
    return this.auditService.list(companyId, limit ? Number(limit) : 100);
  }
}
