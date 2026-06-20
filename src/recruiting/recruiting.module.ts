import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';
import { CareersController } from './careers.controller';
import { RecruitingController } from './recruiting.controller';
import { RecruitingRepository } from './recruiting.repository';
import { RecruitingService } from './recruiting.service';

/**
 * Recruiting / ATS (Phase 9). Internal management + the public careers site.
 * GeminiService (AI hooks) and the infra adapters come from global modules.
 */
@Module({
  imports: [NotificationsModule],
  controllers: [RecruitingController, CareersController],
  providers: [RecruitingService, RecruitingRepository, RateLimitGuard],
  exports: [RecruitingService],
})
export class RecruitingModule {}
