import { Global, Module } from '@nestjs/common';
import { MailerService } from './mailer.service';
import { QueueService } from './queue.service';
import { StorageService } from './storage.service';

/**
 * Cross-cutting external-service adapters (storage, queue, email), all with
 * graceful degradation so the app boots/builds without live infra. Global so
 * any feature module can inject them.
 */
@Global()
@Module({
  providers: [StorageService, QueueService, MailerService],
  exports: [StorageService, QueueService, MailerService],
})
export class InfraModule {}
