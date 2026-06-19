import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { BillingController } from './billing.controller';
import { BillingRepository } from './billing.repository';
import { BillingService } from './billing.service';
import { StripeService } from './stripe.service';
import { WebhooksController } from './webhooks.controller';

/**
 * Billing & subscriptions (Phase 8). Exports BillingService so feature modules
 * (employees/stores) can call `assertWithinLimit` before an add.
 */
@Module({
  imports: [NotificationsModule],
  controllers: [BillingController, WebhooksController],
  providers: [BillingService, BillingRepository, StripeService],
  exports: [BillingService],
})
export class BillingModule {}
