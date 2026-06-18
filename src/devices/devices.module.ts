import { Module } from '@nestjs/common';
import { DevicesController } from './devices.controller';
import { DevicesRepository } from './devices.repository';
import { DevicesService } from './devices.service';
import { TerminalsController } from './terminals.controller';

@Module({
  controllers: [DevicesController, TerminalsController],
  providers: [DevicesService, DevicesRepository],
  exports: [DevicesService, DevicesRepository],
})
export class DevicesModule {}
