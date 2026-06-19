import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import type { AppConfig } from '../config/configuration';

/**
 * Thin Stripe wrapper with graceful degradation. With STRIPE_SECRET_KEY set,
 * real Checkout/Portal sessions are created and webhooks are signature-verified.
 * Without it (dev / no billing), session creation returns a local stub URL and
 * webhook verification is disabled — the API contract holds, nothing crashes.
 */
@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly client?: Stripe;
  private readonly webhookSecret?: string;

  constructor(config: ConfigService<AppConfig, true>) {
    const secretKey = config.get('stripe.secretKey', { infer: true });
    this.webhookSecret = config.get('stripe.webhookSecret', { infer: true });
    if (secretKey) {
      // Pin to the SDK's bundled API version (no explicit apiVersion → no
      // brittle string coupling when the SDK upgrades).
      this.client = new Stripe(secretKey);
    } else {
      this.logger.warn('STRIPE_SECRET_KEY unset — billing runs in stub mode.');
    }
  }

  get enabled(): boolean {
    return Boolean(this.client);
  }

  /** Reuse or create a Stripe customer for a company. */
  async ensureCustomer(params: {
    companyId: string;
    name: string;
    existingCustomerId?: string | null;
  }): Promise<string | null> {
    if (!this.client) return null;
    if (params.existingCustomerId) return params.existingCustomerId;
    const customer = await this.client.customers.create({
      name: params.name,
      metadata: { companyId: params.companyId },
    });
    return customer.id;
  }

  /** Checkout session for a new/changed subscription. */
  async createCheckoutSession(params: {
    customerId: string | null;
    priceId: string;
    companyId: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string }> {
    if (!this.client || !params.customerId) {
      return { url: `${params.successUrl}?stub=1` };
    }
    const session = await this.client.checkout.sessions.create({
      mode: 'subscription',
      customer: params.customerId,
      line_items: [{ price: params.priceId, quantity: 1 }],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      subscription_data: { metadata: { companyId: params.companyId } },
      metadata: { companyId: params.companyId },
    });
    return { url: session.url ?? params.successUrl };
  }

  /** Customer Portal session for card/cancel self-service. */
  async createPortalSession(params: {
    customerId: string | null;
    returnUrl: string;
  }): Promise<{ url: string }> {
    if (!this.client || !params.customerId) {
      return { url: `${params.returnUrl}?stub=1` };
    }
    const session = await this.client.billingPortal.sessions.create({
      customer: params.customerId,
      return_url: params.returnUrl,
    });
    return { url: session.url };
  }

  /**
   * Verify + parse a webhook payload. Throws if the signature can't be verified
   * (when a webhook secret is configured). Returns `null` in stub mode so the
   * handler can 200 fast without acting.
   */
  constructEvent(rawBody: Buffer, signature: string | undefined): Stripe.Event | null {
    if (!this.client || !this.webhookSecret || !signature) return null;
    return this.client.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
  }
}
