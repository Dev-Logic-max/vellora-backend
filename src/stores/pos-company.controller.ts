import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
import {
  AdjustLoyaltyDto,
  CreateCustomerDto,
  CreateDiscountDto,
  UpdateCustomerDto,
  UpdateDiscountDto,
} from './dto/pos.dto';
import { PosManagementService } from './pos-management.service';
import { PosOrdersService } from './pos-orders.service';
import { PosService } from './pos.service';

const MANAGER_ROLES = ['owner', 'hr', 'area_manager', 'store_manager'] as const;

/**
 * Company-wide POS endpoints backing the standalone POS suite (Dashboard, Sales,
 * Orders, Products, Customers, Discounts across all the company's stores). Gated
 * by the dedicated `pos_*` permissions so sidebar visibility matches the matrix.
 */
@ApiTags('pos')
@ApiBearerAuth()
@Controller('pos')
@UseGuards(TenantGuard, PermissionGuard)
export class PosCompanyController {
  constructor(
    private readonly pos: PosService,
    private readonly orders: PosOrdersService,
    private readonly mgmt: PosManagementService,
  ) {}

  // ── products (roll-up) ──────────────────────────────────────────────────────
  @Get('products')
  @RequirePermission('pos_products')
  products(@CompanyId() companyId: string) {
    return this.pos.companyProducts(companyId);
  }

  // ── sales + reports ─────────────────────────────────────────────────────────
  @Get('sales')
  @RequirePermission('pos_sales')
  sales(@CompanyId() companyId: string) {
    return this.pos.companySales(companyId);
  }

  @Get('report')
  @RequirePermission('pos_sales')
  report(
    @CompanyId() companyId: string,
    @Query('range') range?: '7d' | '30d',
    @Query('storeId') storeId?: string,
  ) {
    return this.pos.report(companyId, range ?? '7d', storeId);
  }

  // ── orders ──────────────────────────────────────────────────────────────────
  @Get('orders')
  @RequirePermission('pos_orders')
  listOrders(@CompanyId() companyId: string, @Query('storeId') storeId?: string) {
    return this.orders.listOrders(companyId, storeId);
  }

  @Get('orders/:id')
  @RequirePermission('pos_orders')
  getOrder(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.getOrder(companyId, id);
  }

  // ── customers + loyalty ──────────────────────────────────────────────────────
  @Get('customers')
  @RequirePermission('pos_customers')
  listCustomers(@CompanyId() companyId: string) {
    return this.mgmt.listCustomers(companyId);
  }

  @Post('customers')
  @RequirePermission('pos_customers')
  @UseGuards(RolesGuard)
  @Roles(...MANAGER_ROLES)
  createCustomer(@CompanyId() companyId: string, @Body() dto: CreateCustomerDto) {
    return this.mgmt.createCustomer(companyId, dto);
  }

  @Patch('customers/:id')
  @RequirePermission('pos_customers')
  @UseGuards(RolesGuard)
  @Roles(...MANAGER_ROLES)
  updateCustomer(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.mgmt.updateCustomer(companyId, id, dto);
  }

  @Delete('customers/:id')
  @RequirePermission('pos_customers')
  @UseGuards(RolesGuard)
  @Roles(...MANAGER_ROLES)
  deleteCustomer(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.mgmt.deleteCustomer(companyId, id);
  }

  @Post('customers/:id/loyalty')
  @RequirePermission('pos_customers')
  @UseGuards(RolesGuard)
  @Roles(...MANAGER_ROLES)
  adjustLoyalty(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdjustLoyaltyDto,
  ) {
    return this.mgmt.adjustLoyalty(companyId, id, dto);
  }

  @Get('customers/:id/orders')
  @RequirePermission('pos_customers')
  customerOrders(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.mgmt.customerOrders(companyId, id);
  }

  // ── discounts (gated with products) ─────────────────────────────────────────
  @Get('discounts')
  @RequirePermission('pos_products')
  listDiscounts(@CompanyId() companyId: string) {
    return this.mgmt.listDiscounts(companyId);
  }

  @Post('discounts')
  @RequirePermission('pos_products')
  @UseGuards(RolesGuard)
  @Roles(...MANAGER_ROLES)
  createDiscount(@CompanyId() companyId: string, @Body() dto: CreateDiscountDto) {
    return this.mgmt.createDiscount(companyId, dto);
  }

  @Patch('discounts/:id')
  @RequirePermission('pos_products')
  @UseGuards(RolesGuard)
  @Roles(...MANAGER_ROLES)
  updateDiscount(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDiscountDto,
  ) {
    return this.mgmt.updateDiscount(companyId, id, dto);
  }

  @Delete('discounts/:id')
  @RequirePermission('pos_products')
  @UseGuards(RolesGuard)
  @Roles(...MANAGER_ROLES)
  deleteDiscount(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.mgmt.deleteDiscount(companyId, id);
  }
}
