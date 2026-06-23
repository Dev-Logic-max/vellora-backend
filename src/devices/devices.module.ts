import { Module } from '@nestjs/common';
import { DeviceRegistrationController } from './device-registration.controller';
import { DeviceRegistrationRepository } from './device-registration.repository';
import { DeviceRegistrationService } from './device-registration.service';
import { DevicesController } from './devices.controller';
import { DevicesRepository } from './devices.repository';
import { DevicesService } from './devices.service';
import { TerminalsController } from './terminals.controller';

@Module({
  controllers: [DevicesController, TerminalsController, DeviceRegistrationController],
  providers: [
    DevicesService,
    DevicesRepository,
    DeviceRegistrationService,
    DeviceRegistrationRepository,
  ],
  exports: [DevicesService, DevicesRepository, DeviceRegistrationService],
})
export class DevicesModule {}
