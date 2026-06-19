import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailRepository } from './email.repository';
import { EmailService } from './email.service';
import { MessagingController } from './messaging.controller';
import { MessagingRepository } from './messaging.repository';
import { MessagingService } from './messaging.service';

@Module({
  imports: [NotificationsModule],
  controllers: [MessagingController],
  providers: [MessagingService, MessagingRepository, EmailService, EmailRepository],
  exports: [MessagingService],
})
export class MessagingModule {}
