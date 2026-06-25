import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PlatformRequestsController } from './platform-requests.controller';
import { PlatformRequestsRepository } from './platform-requests.repository';
import { PlatformRequestsService } from './platform-requests.service';

/**
 * Tenant→platform request inbox. Exports the service so the AdminModule can wire
 * the platform-side (list/respond/delete) routes behind the PlatformGuard.
 */
@Module({
  imports: [NotificationsModule],
  controllers: [PlatformRequestsController],
  providers: [PlatformRequestsService, PlatformRequestsRepository],
  exports: [PlatformRequestsService],
})
export class PlatformRequestsModule {}
