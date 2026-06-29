import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PlatformGuard } from '../common/guards/platform.guard';
import { PlatformOverviewService } from './platform-overview.service';

/**
 * Platform-wide aggregate views for platform operators. Cross-tenant — gated by
 * PlatformGuard (platform_role), NO TenantGuard. Returns data across ALL
 * companies (each row tagged with its company). The FE uses these in the module
 * pages when the signed-in user is a platform operator.
 */
@ApiTags('platform')
@ApiBearerAuth()
@Controller('platform')
@UseGuards(PlatformGuard)
export class PlatformOverviewController {
  constructor(private readonly overview: PlatformOverviewService) {}

  @Get('summary')
  summary() {
    return this.overview.summary();
  }

  @Get('stores')
  stores() {
    return this.overview.stores();
  }

  @Get('offices')
  offices() {
    return this.overview.offices();
  }

  @Get('factories')
  factories() {
    return this.overview.factories();
  }

  @Get('employees')
  employees() {
    return this.overview.employees();
  }

  @Get('products')
  products() {
    return this.overview.products();
  }
}
