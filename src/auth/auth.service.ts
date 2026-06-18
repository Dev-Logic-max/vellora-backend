import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq } from 'drizzle-orm';
import { decodeJwt, jwtVerify } from 'jose';
import type { AppConfig } from '../config/configuration';
import { DatabaseService } from '../database/database.service';
import { memberships, users, type User } from '../database/schema';
import type { AuthenticatedUser, MembershipContext } from '../common/types/authenticated-user';

/**
 * Verifies the Supabase access token (HS256 via SUPABASE_JWT_SECRET), resolves
 * the application `users` row by `sub` (lazily provisioning it on first login),
 * and loads the user's active memberships to derive the tenant context.
 *
 * The tenant is NEVER taken from a client-supplied claim — it is derived from
 * the verified identity's memberships in the database. An optional
 * `requestedCompanyId` (the company switcher) may select AMONG those verified
 * memberships, but can never widen access.
 *
 * Dev fallback: with no SUPABASE_JWT_SECRET set, tokens are decoded WITHOUT
 * signature verification so the scaffold runs without real credentials. This
 * project has the secret set, so verification is active.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly jwtSecret?: string;

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly databaseService: DatabaseService,
  ) {
    this.jwtSecret = this.config.get('supabase.jwtSecret', { infer: true });
  }

  async authenticate(token: string, requestedCompanyId?: string): Promise<AuthenticatedUser> {
    const claims = await this.verifyOrDecode(token);

    const supabaseUid = typeof claims.sub === 'string' ? claims.sub : undefined;
    const email = typeof claims.email === 'string' ? claims.email : undefined;
    if (!supabaseUid || !email) {
      throw new UnauthorizedException('Token is missing required claims (sub, email).');
    }

    const user = await this.findOrProvisionUser(supabaseUid, email, this.readName(claims));
    const ctx = await this.loadMemberships(user.id);
    const active = this.pickActiveMembership(ctx, requestedCompanyId);

    return {
      supabaseUid: user.supabaseUid,
      userId: user.id,
      email: user.email,
      name: user.name,
      memberships: ctx,
      companyId: active?.companyId,
      role: active?.role,
      scopeType: active?.scopeType,
      scopeIds: active?.scopeIds,
    };
  }

  private async verifyOrDecode(token: string): Promise<Record<string, unknown>> {
    if (!this.jwtSecret) {
      this.logger.warn(
        'SUPABASE_JWT_SECRET is not set — decoding JWT WITHOUT signature verification (dev only).',
      );
      try {
        return decodeJwt(token);
      } catch {
        throw new UnauthorizedException('Malformed access token.');
      }
    }

    try {
      const secret = new TextEncoder().encode(this.jwtSecret);
      const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token.');
    }
  }

  /** Cross-tenant lookup — runs on the privileged connection (no RLS scope). */
  private async findOrProvisionUser(
    supabaseUid: string,
    email: string,
    name: string | null,
  ): Promise<User> {
    const db = this.databaseService.db;

    const existing = await db.query.users.findFirst({
      where: eq(users.supabaseUid, supabaseUid),
    });
    if (existing) {
      return existing;
    }

    const [created] = await db
      .insert(users)
      .values({ supabaseUid, email, name })
      .onConflictDoUpdate({
        target: users.supabaseUid,
        set: { email, name },
      })
      .returning();
    return created;
  }

  private async loadMemberships(userId: string): Promise<MembershipContext[]> {
    const rows = await this.databaseService.db.query.memberships.findMany({
      where: and(eq(memberships.userId, userId), eq(memberships.status, 'active')),
    });
    return rows.map((m) => ({
      companyId: m.companyId,
      role: m.role,
      scopeType: m.scopeType,
      scopeIds: m.scopeIds,
    }));
  }

  private pickActiveMembership(
    ctx: MembershipContext[],
    requestedCompanyId?: string,
  ): MembershipContext | undefined {
    if (requestedCompanyId) {
      const match = ctx.find((m) => m.companyId === requestedCompanyId);
      if (match) {
        return match;
      }
      // A requested company the user is not a member of is silently ignored
      // (falls through to the default) — never widens access.
    }
    return ctx[0];
  }

  private readName(claims: Record<string, unknown>): string | null {
    const meta = claims.user_metadata;
    if (meta && typeof meta === 'object') {
      const record = meta as Record<string, unknown>;
      const candidate = record.full_name ?? record.name;
      if (typeof candidate === 'string' && candidate.length > 0) {
        return candidate;
      }
    }
    const top = claims.name;
    return typeof top === 'string' && top.length > 0 ? top : null;
  }
}
