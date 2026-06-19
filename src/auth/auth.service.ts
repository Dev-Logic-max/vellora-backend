import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq } from 'drizzle-orm';
import { createRemoteJWKSet, decodeJwt, jwtVerify, type JWTVerifyGetKey } from 'jose';
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
  /** JWKS for projects using asymmetric (ES256/RS256) signing keys. Cached by jose. */
  private readonly jwks?: JWTVerifyGetKey;

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly databaseService: DatabaseService,
  ) {
    this.jwtSecret = this.config.get('supabase.jwtSecret', { infer: true });
    const supabaseUrl = this.config.get('supabase.url', { infer: true });
    if (supabaseUrl) {
      this.jwks = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));
    }
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
    // Supabase signs access tokens with either asymmetric keys (ES256/RS256 via
    // JWKS) or the legacy symmetric secret (HS256). Try whichever matches the
    // token's `alg`; only fall back to unverified decode when nothing is set.
    const alg = this.tokenAlg(token);

    if (alg && alg !== 'HS256' && this.jwks) {
      try {
        const { payload } = await jwtVerify(token, this.jwks);
        return payload;
      } catch {
        throw new UnauthorizedException('Invalid or expired access token.');
      }
    }

    if (this.jwtSecret) {
      try {
        const secret = new TextEncoder().encode(this.jwtSecret);
        const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
        return payload;
      } catch {
        // An HS256 secret is set but the token is asymmetric → try JWKS too.
        if (this.jwks) {
          try {
            const { payload } = await jwtVerify(token, this.jwks);
            return payload;
          } catch {
            throw new UnauthorizedException('Invalid or expired access token.');
          }
        }
        throw new UnauthorizedException('Invalid or expired access token.');
      }
    }

    this.logger.warn(
      'No SUPABASE_JWT_SECRET or JWKS available — decoding JWT WITHOUT verification (dev only).',
    );
    try {
      return decodeJwt(token);
    } catch {
      throw new UnauthorizedException('Malformed access token.');
    }
  }

  /** Reads the JWT header `alg` without verifying. */
  private tokenAlg(token: string): string | undefined {
    try {
      const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8')) as {
        alg?: string;
      };
      return header.alg;
    } catch {
      return undefined;
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
