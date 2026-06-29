import {
  Body,
  Controller,
  Delete,
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
import {
  AdjustStockDto,
  CreateProductCategoryDto,
  CreateProductDto,
  UpdateProductDto,
} from './dto/product.dto';
import { PosService } from './pos.service';

/** POS product management for a store (nested under /stores/:storeId/pos). */
@ApiTags('pos')
@ApiBearerAuth()
@Controller('stores/:storeId/pos')
@UseGuards(TenantGuard, PermissionGuard)
@RequirePermission('stores')
export class PosController {
  constructor(private readonly pos: PosService) {}

  // ── categories ────────────────────────────────────────────────────────────
  @Get('categories')
  listCategories(@CompanyId() companyId: string, @Param('storeId', ParseUUIDPipe) storeId: string) {
    return this.pos.listCategories(companyId, storeId);
  }

  @Post('categories')
  @UseGuards(RolesGuard)
  @Roles('owner', 'hr', 'area_manager', 'store_manager')
  createCategory(
    @CompanyId() companyId: string,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Body() dto: CreateProductCategoryDto,
  ) {
    return this.pos.createCategory(companyId, storeId, dto);
  }

  @Delete('categories/:id')
  @UseGuards(RolesGuard)
  @Roles('owner', 'hr', 'area_manager', 'store_manager')
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
  @Roles('owner', 'hr', 'area_manager', 'store_manager')
  createProduct(
    @CompanyId() companyId: string,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Body() dto: CreateProductDto,
  ) {
    return this.pos.createProduct(companyId, storeId, dto);
  }

  @Patch('products/:id')
  @UseGuards(RolesGuard)
  @Roles('owner', 'hr', 'area_manager', 'store_manager')
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
  @Roles('owner', 'hr', 'area_manager', 'store_manager')
  adjustStock(
    @CompanyId() companyId: string,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdjustStockDto,
  ) {
    return this.pos.adjustStock(companyId, storeId, id, dto);
  }

  @Delete('products/:id')
  @UseGuards(RolesGuard)
  @Roles('owner', 'hr', 'area_manager', 'store_manager')
  deleteProduct(
    @CompanyId() companyId: string,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.pos.deleteProduct(companyId, storeId, id);
  }

  // ── sales (mock) ──────────────────────────────────────────────────────────
  @Get('sales')
  sales(@CompanyId() companyId: string, @Param('storeId', ParseUUIDPipe) storeId: string) {
    return this.pos.sales(companyId, storeId);
  }
}
