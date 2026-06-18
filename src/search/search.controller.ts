import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CompanyId } from '../common/decorators/company-id.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { SearchService, type SearchResult } from './search.service';

@ApiTags('search')
@ApiBearerAuth()
@Controller('search')
@UseGuards(TenantGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  search(
    @CompanyId() companyId: string,
    @Query('q') q = '',
    @Query('types') types?: string,
  ): Promise<SearchResult[]> {
    const typeList = types
      ? types
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      : undefined;
    return this.searchService.search(companyId, q, typeList);
  }
}
