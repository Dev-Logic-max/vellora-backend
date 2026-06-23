import { Module } from '@nestjs/common';
import { DevicesModule } from '../devices/devices.module';
import { AttendanceController } from './attendance.controller';
import { AttendanceRepository } from './attendance.repository';
import { AttendanceService } from './attendance.service';
import { KioskController } from './kiosk.controller';

@Module({
  imports: [DevicesModule],
  controllers: [AttendanceController, KioskController],
  providers: [AttendanceService, AttendanceRepository],
  exports: [AttendanceService, AttendanceRepository],
})
export class AttendanceModule {}
