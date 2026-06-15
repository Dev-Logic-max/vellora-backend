import type { UserRole } from '../../database/schema/enums';

/**
 * The principal attached to a request after the auth guard validates the
 * Supabase JWT. `companyId` is the tenant boundary used everywhere downstream.
 */
export interface AuthenticatedUser {
  /** Supabase Auth subject (`sub` claim). */
  supabaseUserId: string;
  /** Application `users.id`, when the principal has been provisioned. */
  userId?: string;
  email: string;
  companyId: string;
  role: UserRole;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}
