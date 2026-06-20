import type { MembershipRole, PlatformRole, ScopeType } from '../../database/schema/enums';

/** A single resolved membership the principal holds. */
export interface MembershipContext {
  companyId: string;
  role: MembershipRole;
  scopeType: ScopeType;
  scopeIds: string[];
}

/**
 * The principal attached to a request after the Supabase JWT is verified and
 * the matching `users` row + memberships are resolved from the database.
 *
 * `companyId`/`role`/`scope*` describe the ACTIVE tenant context for this
 * request — chosen from `memberships` (optionally narrowed by an `x-company-id`
 * header that must match one of the user's memberships). They are undefined for
 * a freshly signed-up user who has no membership yet.
 */
export interface AuthenticatedUser {
  /** Supabase Auth subject (`sub` claim). */
  supabaseUid: string;
  /** Application `users.id`. */
  userId: string;
  email: string;
  name: string | null;
  memberships: MembershipContext[];
  companyId?: string;
  role?: MembershipRole;
  scopeType?: ScopeType;
  scopeIds?: string[];
  /** Cross-tenant operator role (null/undefined for normal tenant users). */
  platformRole?: PlatformRole | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}
