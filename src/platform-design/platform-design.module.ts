import { Module } from '@nestjs/common';
import { PlatformDesignController } from './platform-design.controller';
import { PlatformDesignService } from './platform-design.service';

/**
 * Platform design settings (design module) — global theme/token config managed
 * by the platform admin and read by the app to apply the active theme.
 */
@Module({
  controllers: [PlatformDesignController],
  providers: [PlatformDesignService],
  exports: [PlatformDesignService],
})
export class PlatformDesignModule {}
