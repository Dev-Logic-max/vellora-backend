import { Module } from '@nestjs/common';
import { LeaveController } from './leave.controller';
import { LeaveRepository } from './leave.repository';
import { LeaveService } from './leave.service';

@Module({
  controllers: [LeaveController],
  providers: [LeaveService, LeaveRepository],
  exports: [LeaveService, LeaveRepository],
})
export class LeaveModule {}
