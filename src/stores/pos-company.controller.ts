import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CompanyId } from '../common/decorators/company-id.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { PermissionGuard } from '../permissions/permission.guard';
import { PosService } from './pos.service';

/**
 * Company-wide POS endpoints backing the standalone POS modules (Products / Sales
 * across all the company's stores). Gated by the dedicated `pos_products` /
 * `pos_sales` permissions so the sidebar visibility matches the matrix.
 */
@ApiTags('pos')
@ApiBearerAuth()
@Controller('pos')
@UseGuards(TenantGuard, PermissionGuard)
export class PosCompanyController {
  constructor(private readonly pos: PosService) {}

  @Get('products')
  @RequirePermission('pos_products')
  products(@CompanyId() companyId: string) {
    return this.pos.companyProducts(companyId);
  }

  @Get('sales')
  @RequirePermission('pos_sales')
  sales(@CompanyId() companyId: string) {
    return this.pos.companySales(companyId);
  }
}
