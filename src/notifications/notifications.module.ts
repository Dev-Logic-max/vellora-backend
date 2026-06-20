import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsRepository } from './notifications.repository';
import { NotificationsService } from './notifications.service';

/**
 * NotificationsService is exported so other modules can `emit()` notifications
 * (documents, messaging, leave, …). Realtime/queue/mailer come from the global
 * RealtimeModule + InfraModule.
 */
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsRepository],
  exports: [NotificationsService],
})
export class NotificationsModule {}
