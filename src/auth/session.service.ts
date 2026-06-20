import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AppConfig } from '../config/configuration';

/**
 * Session revocation against Supabase Auth (hardening, P9-E). Supabase issues +
 * ROTATES refresh tokens itself; our backend only verifies access tokens. This
 * service performs a server-side GLOBAL revoke of a user's refresh tokens —
 * used on explicit logout and after a password change — via the admin API.
 *
 * Degrades gracefully without a service-role key (logged no-op): the client's
 * own `supabase.auth.signOut()` still clears the local session.
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly admin?: SupabaseClient;

  constructor(config: ConfigService<AppConfig, true>) {
    const url = config.get('supabase.url', { infer: true });
    const key = config.get('supabase.serviceRoleKey', { infer: true });
    if (url && key) {
      this.admin = createClient(url, key, { auth: { persistSession: false } });
    } else {
      this.logger.warn('Supabase service-role key unset — server-side revoke is a no-op.');
    }
  }

  /** Revoke ALL of a user's refresh tokens (sign out everywhere). */
  async revokeAll(supabaseUid: string): Promise<{ ok: boolean }> {
    if (!this.admin) return { ok: false };
    try {
      // Global scope invalidates every refresh token for the user.
      await this.admin.auth.admin.signOut(supabaseUid, 'global');
      return { ok: true };
    } catch (err) {
      this.logger.warn(`Session revoke failed: ${(err as Error).message}`);
      return { ok: false };
    }
  }
}
