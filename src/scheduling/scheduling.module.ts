import { Module } from '@nestjs/common';
import { SchedulingController } from './scheduling.controller';
import { SchedulingRepository } from './scheduling.repository';
import { SchedulingService } from './scheduling.service';

@Module({
  controllers: [SchedulingController],
  providers: [SchedulingService, SchedulingRepository],
  exports: [SchedulingService, SchedulingRepository],
})
export class SchedulingModule {}
