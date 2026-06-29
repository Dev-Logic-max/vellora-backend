import { Module } from '@nestjs/common';
import { PlatformOverviewController } from './platform-overview.controller';
import { PlatformOverviewService } from './platform-overview.service';

/** Platform-wide aggregate reads for platform operators (cross-tenant). */
@Module({
  controllers: [PlatformOverviewController],
  providers: [PlatformOverviewService],
})
export class PlatformOverviewModule {}
