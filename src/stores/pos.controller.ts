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
  AdjustStockDto,
  CreateProductCategoryDto,
  CreateProductDto,
  UpdateProductDto,
} from './dto/product.dto';
import {
  CheckoutDto,
  CloseSessionDto,
  CreateRegisterDto,
  OpenSessionDto,
  RefundOrderDto,
  RestockDto,
  SetTaxDto,
} from './dto/pos.dto';
import { PosManagementService } from './pos-management.service';
import { PosOrdersService } from './pos-orders.service';
import { PosService } from './pos.service';

const MANAGER_ROLES = ['owner', 'hr', 'area_manager', 'store_manager'] as const;

/** POS operations for a store (nested under /stores/:storeId/pos). */
@ApiTags('pos')
@ApiBearerAuth()
@Controller('stores/:storeId/pos')
@UseGuards(TenantGuard, PermissionGuard)
@RequirePermission('pos_products')
export class PosController {
  constructor(
    private readonly pos: PosService,
    private readonly orders: PosOrdersService,
    private readonly mgmt: PosManagementService,
  ) {}

  // ── categories ────────────────────────────────────────────────────────────
  @Get('categories')
  listCategories(@CompanyId() companyId: string, @Param('storeId', ParseUUIDPipe) storeId: string) {
    return this.pos.listCategories(companyId, storeId);
  }

  @Post('categories')
  @UseGuards(RolesGuard)
  @Roles(...MANAGER_ROLES)
  createCategory(
    @CompanyId() companyId: string,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Body() dto: CreateProductCategoryDto,
  ) {
    return this.pos.createCategory(companyId, storeId, dto);
  }

  @Delete('categories/:id')
  @UseGuards(RolesGuard)
  @Roles(...MANAGER_ROLES)
  deleteCategory(
    @CompanyId() companyId: string,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.pos.deleteCategory(companyId, storeId, id);
  }

  // ── products ──────────────────────────────────────────────────────────────
  @Get('products')
  listProducts(@CompanyId() companyId: string, @Param('storeId', ParseUUIDPipe) storeId: string) {
    return this.pos.listProducts(companyId, storeId);
  }

  @Post('products')
  @UseGuards(RolesGuard)
  @Roles(...MANAGER_ROLES)
  createProduct(
    @CompanyId() companyId: string,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Body() dto: CreateProductDto,
  ) {
    return this.pos.createProduct(companyId, storeId, dto);
  }

  @Patch('products/:id')
  @UseGuards(RolesGuard)
  @Roles(...MANAGER_ROLES)
  updateProduct(
    @CompanyId() companyId: string,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.pos.updateProduct(companyId, storeId, id, dto);
  }

  @Post('products/:id/stock')
  @UseGuards(RolesGuard)
  @Roles(...MANAGER_ROLES)
  adjustStock(
    @CompanyId() companyId: string,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdjustStockDto,
  ) {
    return this.pos.adjustStock(companyId, storeId, id, dto);
  }

  @Post('products/:id/restock')
  @UseGuards(RolesGuard)
  @Roles(...MANAGER_ROLES)
  restock(
    @CompanyId() companyId: string,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RestockDto,
  ) {
    return this.pos.restock(companyId, storeId, id, dto);
  }

  @Delete('products/:id')
  @UseGuards(RolesGuard)
  @Roles(...MANAGER_ROLES)
  deleteProduct(
    @CompanyId() companyId: string,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.pos.deleteProduct(companyId, storeId, id);
  }

  // ── inventory ────────────────────────────────────────────────────────────
  @Get('inventory/movements')
  movements(
    @CompanyId() companyId: string,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Query('productId') productId?: string,
  ) {
    return this.pos.stockMovements(companyId, storeId, productId);
  }

  // ── checkout + orders ──────────────────────────────────────────────────────
  @Post('checkout')
  @UseGuards(RolesGuard)
  @Roles(...MANAGER_ROLES)
  checkout(
    @CompanyId() companyId: string,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Body() dto: CheckoutDto,
  ) {
    return this.orders.checkout(companyId, storeId, dto);
  }

  @Get('orders')
  listOrders(@CompanyId() companyId: string, @Param('storeId', ParseUUIDPipe) storeId: string) {
    return this.orders.listOrders(companyId, storeId);
  }

  @Post('orders/:id/refund')
  @UseGuards(RolesGuard)
  @Roles(...MANAGER_ROLES)
  refund(
    @CompanyId() companyId: string,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RefundOrderDto,
  ) {
    return this.orders.refund(companyId, storeId, id, dto);
  }

  // ── registers + sessions ────────────────────────────────────────────────────
  @Get('registers')
  listRegisters(@CompanyId() companyId: string, @Param('storeId', ParseUUIDPipe) storeId: string) {
    return this.mgmt.listRegisters(companyId, storeId);
  }

  @Post('registers')
  @UseGuards(RolesGuard)
  @Roles(...MANAGER_ROLES)
  createRegister(
    @CompanyId() companyId: string,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Body() dto: CreateRegisterDto,
  ) {
    return this.mgmt.createRegister(companyId, storeId, dto);
  }

  @Delete('registers/:id')
  @UseGuards(RolesGuard)
  @Roles(...MANAGER_ROLES)
  deleteRegister(
    @CompanyId() companyId: string,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.mgmt.deleteRegister(companyId, storeId, id);
  }

  @Post('registers/sessions')
  @UseGuards(RolesGuard)
  @Roles(...MANAGER_ROLES)
  openSession(
    @CompanyId() companyId: string,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Body() dto: OpenSessionDto,
  ) {
    return this.mgmt.openSession(companyId, storeId, dto);
  }

  @Post('registers/sessions/:id/close')
  @UseGuards(RolesGuard)
  @Roles(...MANAGER_ROLES)
  closeSession(
    @CompanyId() companyId: string,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseSessionDto,
  ) {
    return this.mgmt.closeSession(companyId, storeId, id, dto);
  }

  @Get('registers/sessions')
  sessionHistory(@CompanyId() companyId: string, @Param('storeId', ParseUUIDPipe) storeId: string) {
    return this.mgmt.sessionHistory(companyId, storeId);
  }

  // ── store tax ────────────────────────────────────────────────────────────
  @Patch('tax')
  @UseGuards(RolesGuard)
  @Roles('owner', 'hr', 'area_manager')
  setTax(
    @CompanyId() companyId: string,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Body() dto: SetTaxDto,
  ) {
    return this.mgmt.setTax(companyId, storeId, dto);
  }

  // ── sales (per store, REAL) ─────────────────────────────────────────────────
  @Get('sales')
  sales(
    @CompanyId() companyId: string,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Query('range') range?: 'today' | '7d' | '30d',
  ) {
    return this.pos.sales(companyId, storeId, range ?? 'today');
  }
}
