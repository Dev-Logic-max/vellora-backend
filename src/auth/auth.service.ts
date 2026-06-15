import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { decodeJwt, jwtVerify } from 'jose';
import type { AppConfig } from '../config/configuration';
import { USER_ROLES, type UserRole } from '../database/schema/enums';
import type { AuthenticatedUser } from '../common/types/authenticated-user';

/**
 * Supabase JWT validation — PLACEHOLDER.
 *
 * When SUPABASE_JWT_SECRET is configured, HS256 access tokens are cryptographically
 * verified. Otherwise the token is only decoded (NOT verified) so the scaffold is
 * usable in local development without real Supabase credentials. Replace the
 * decode-only path before any non-dev use.
 *
 * TODO(Phase 1): support Supabase's asymmetric (ES256/RS256) signing keys by
 * fetching the project JWKS, and map the `sub` claim to an application user row
 * to resolve `companyId`/`role` from the database rather than custom claims.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly jwtSecret?: string;

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    this.jwtSecret = this.config.get('supabase.jwtSecret', { infer: true });
  }

  async validateAccessToken(token: string): Promise<AuthenticatedUser> {
    const claims = await this.verifyOrDecode(token);

    const supabaseUserId = typeof claims.sub === 'string' ? claims.sub : undefined;
    const email = typeof claims.email === 'string' ? claims.email : undefined;

    if (!supabaseUserId || !email) {
      throw new UnauthorizedException('Token is missing required claims (sub, email).');
    }

    // Tenant + role are expected as custom claims (set via a Supabase Auth hook
    // or copied from app_metadata). Until that wiring exists they may be absent.
    const companyId = this.readStringClaim(claims, 'company_id');
    if (!companyId) {
      throw new UnauthorizedException('Token is missing the company_id claim.');
    }

    return {
      supabaseUserId,
      email,
      companyId,
      role: this.normalizeRole(this.readStringClaim(claims, 'role')),
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
      const { payload } = await jwtVerify(token, secret);
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token.');
    }
  }

  private readStringClaim(claims: Record<string, unknown>, key: string): string | undefined {
    const value = claims[key];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private normalizeRole(value: string | undefined): UserRole {
    return (USER_ROLES as readonly string[]).includes(value ?? '')
      ? (value as UserRole)
      : 'employee';
  }
}
