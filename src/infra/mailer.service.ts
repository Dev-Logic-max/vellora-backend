import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import type { AppConfig } from '../config/configuration';

export interface SendEmailInput {
  to: string[];
  subject: string;
  /** Plain text / simple HTML body. */
  body: string;
  from?: string;
}

export interface SendEmailResult {
  ok: boolean;
  providerId?: string;
  error?: string;
}

/**
 * Resend-backed mailer with graceful degradation. Without RESEND_API_KEY the
 * send is logged and returns ok=false (so callers can mark the message as
 * `failed`/queued without crashing) — the API and queue flow still work.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly resend?: Resend;
  private readonly defaultFrom: string;

  constructor(config: ConfigService<AppConfig, true>) {
    const apiKey = config.get('email.apiKey', { infer: true });
    this.defaultFrom = config.get('email.from', { infer: true });
    if (apiKey) this.resend = new Resend(apiKey);
    else this.logger.warn('RESEND_API_KEY unset — emails are logged, not sent.');
  }

  get enabled(): boolean {
    return Boolean(this.resend);
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const from = input.from ?? this.defaultFrom;
    if (!this.resend) {
      this.logger.log(`[email:dry-run] to=${input.to.join(',')} subject="${input.subject}"`);
      return { ok: false, error: 'email_disabled' };
    }
    try {
      const { data, error } = await this.resend.emails.send({
        from,
        to: input.to,
        subject: input.subject,
        html: input.body,
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true, providerId: data?.id };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }
}
