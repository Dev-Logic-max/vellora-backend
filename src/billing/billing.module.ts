import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';
import { BillingController } from './billing.controller';
import { BillingRepository } from './billing.repository';
import { BillingService } from './billing.service';
import { PlansPublicController } from './plans-public.controller';
import { StripeService } from './stripe.service';
import { WebhooksController } from './webhooks.controller';

/**
 * Billing & subscriptions (Phase 8). Exports BillingService so feature modules
 * (employees/stores) can call `assertWithinLimit` before an add. The public
 * plans controller feeds registration/pricing cards.
 */
@Module({
  imports: [NotificationsModule],
  controllers: [BillingController, WebhooksController, PlansPublicController],
  providers: [BillingService, BillingRepository, StripeService, RateLimitGuard],
  exports: [BillingService],
})
export class BillingModule {}
