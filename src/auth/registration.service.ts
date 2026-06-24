import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import type { AppConfig } from '../config/configuration';
import { DatabaseService } from '../database/database.service';
import { defaultsForCountry } from '../companies/country-defaults';
import { companies, memberships, plans, subscriptions, users } from '../database/schema';
import type { RegisterDto } from './dto/register.dto';

export interface RegisterResult {
  companyId: string;
  companyName: string;
  status: string;
  ownerEmail: string;
  /** True when a verification email was actually sent (Supabase configured). */
  emailSent: boolean;
}

/**
 * Public self-service registration. Creates the owner's Supabase auth user (which
 * sends the verification email), then provisions — in one transaction — the
 * company (status `pending`), the application `users` row, an `owner` membership,
 * and a trialing subscription on the chosen plan. The company is visible in the
 * Companies module immediately (pending); first login with a confirmed email
 * promotes it to `active` (see AuthService.promotePendingCompanies).
 *
 * Degrades without a Supabase key: if no auth user can be created we abort (no
 * orphan tenant) — registration genuinely needs an identity to own the company.
 */
@Injectable()
export class RegistrationService {
  private readonly logger = new Logger(RegistrationService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async register(dto: RegisterDto): Promise<RegisterResult> {
    const email = dto.ownerEmail.trim().toLowerCase();

    // Reject duplicates early (friendly 409 instead of a Supabase 4xx leak).
    const existing = await this.databaseService.db.query.users.findFirst({
      where: eq(users.email, email),
      columns: { id: true },
    });
    if (existing) {
      throw new ConflictException('An account with this email already exists. Try signing in.');
    }

    // 1) Create the auth identity + send the verification email (GoTrue signup).
    const { supabaseUid, emailSent } = await this.signUpOwner(
      email,
      dto.ownerPassword,
      dto.ownerName,
    );

    // 2) Resolve the chosen plan (defaults to free) on the privileged connection.
    const planKey = dto.planKey ?? 'free';
    const plan = await this.databaseService.db.query.plans.findFirst({
      where: eq(plans.key, planKey),
    });

    const cd = defaultsForCountry(dto.country);
    const slug = await this.uniqueSlug(dto.slug || dto.companyName);

    // 3) Provision tenant atomically.
    const result = await this.databaseService.db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ supabaseUid, email, name: dto.ownerName })
        .returning();

      const [company] = await tx
        .insert(companies)
        .values({
          name: dto.companyName,
          slug,
          status: 'pending',
          country: dto.country ?? 'US',
          currency: dto.currency ?? cd.currency,
          timezone: dto.timezone ?? cd.timezone,
          category: dto.category ?? null,
          ownerUserId: user.id,
          companyEmail: dto.companyEmail ?? null,
          ownerPhone: dto.ownerPhone ?? null,
          ownerSecondaryEmail: dto.ownerSecondaryEmail ?? null,
          ownerPersonalEmail: dto.ownerPersonalEmail ?? null,
          ...(plan ? { planId: plan.id } : {}),
        })
        .returning();

      await tx.insert(memberships).values({
        userId: user.id,
        companyId: company.id,
        role: 'owner',
        scopeType: 'company',
        scopeIds: [],
        status: 'active',
      });

      // Trialing subscription so plan caps apply immediately (14-day trial).
      if (plan) {
        await tx.insert(subscriptions).values({
          companyId: company.id,
          planId: plan.id,
          status: 'trialing',
          interval: dto.interval ?? 'month',
          trialEndsAt: new Date(Date.now() + 14 * 86_400_000),
        });
      }

      return company;
    });

    return {
      companyId: result.id,
      companyName: result.name,
      status: result.status,
      ownerEmail: email,
      emailSent,
    };
  }

  /**
   * Server-side GoTrue signup (anon key) — creates the user, sets the password,
   * and sends the email-confirmation link. Returns the new user's id (supabaseUid).
   */
  private async signUpOwner(
    email: string,
    password: string,
    name: string,
  ): Promise<{ supabaseUid: string; emailSent: boolean }> {
    const url = this.config.get('supabase.url', { infer: true });
    const anonKey = this.config.get('supabase.anonKey', { infer: true });
    const appUrl = this.config.get('appUrl', { infer: true });
    if (!url || !anonKey) {
      this.logger.error('Supabase not configured — cannot register an owner identity.');
      throw new BadRequestException('Registration is temporarily unavailable. Please try later.');
    }
    try {
      const res = await fetch(`${url}/auth/v1/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: anonKey },
        body: JSON.stringify({
          email,
          password,
          data: { full_name: name },
          // Land back on /login after confirming the email.
          options: { email_redirect_to: `${appUrl}/login?verified=1` },
        }),
      });
      const body = (await res.json()) as {
        id?: string;
        user?: { id?: string };
        msg?: string;
        error_description?: string;
        code?: string;
      };
      if (!res.ok) {
        const msg = body.error_description ?? body.msg ?? 'Could not create the account.';
        if (res.status === 422 || body.code === 'user_already_exists') {
          throw new ConflictException('An account with this email already exists.');
        }
        throw new BadRequestException(msg);
      }
      const supabaseUid = body.user?.id ?? body.id;
      if (!supabaseUid) {
        throw new BadRequestException('Account created but no identity returned.');
      }
      return { supabaseUid, emailSent: true };
    } catch (err) {
      if (err instanceof ConflictException || err instanceof BadRequestException) throw err;
      this.logger.error(`Owner signup failed: ${(err as Error).message}`);
      throw new BadRequestException('Could not create the account. Please try again.');
    }
  }

  /** Slugify + ensure uniqueness against existing company slugs. */
  private async uniqueSlug(base: string): Promise<string> {
    const root =
      base
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'company';
    let candidate = root;
    let n = 1;
    // Privileged read of the global-unique slug column.
    while (
      await this.databaseService.db.query.companies.findFirst({
        where: eq(companies.slug, candidate),
        columns: { id: true },
      })
    ) {
      n += 1;
      candidate = `${root}-${n}`;
    }
    return candidate;
  }
}
