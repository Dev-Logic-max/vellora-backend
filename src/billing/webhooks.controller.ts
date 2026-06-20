import { Controller, Headers, HttpCode, Logger, Post, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { BillingService } from './billing.service';
import { StripeService } from './stripe.service';

/**
 * Stripe webhook sink (api-conventions §Webhooks). NO auth guard — the Stripe
 * SIGNATURE is the auth. We verify it against the raw body, respond 200 fast,
 * and process the event on the BullMQ billing queue. Mounted outside `/billing`
 * so it never inherits the Owner/role guards.
 */
@ApiExcludeController()
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly billing: BillingService,
    private readonly stripe: StripeService,
  ) {}

  @Post('stripe')
  @HttpCode(200)
  async stripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ): Promise<{ received: true }> {
    const raw = req.rawBody;
    if (!raw) {
      // Stub mode (no signing secret) or missing raw body — accept + drop.
      return { received: true };
    }
    try {
      const event = this.stripe.constructEvent(raw, signature);
      if (event) await this.billing.enqueueEvent(event);
    } catch (err) {
      // Signature failure → log + still 200 so Stripe doesn't hammer retries
      // on an unverifiable payload; never act on an unverified event.
      this.logger.warn(`Stripe webhook rejected: ${(err as Error).message}`);
    }
    return { received: true };
  }
}
