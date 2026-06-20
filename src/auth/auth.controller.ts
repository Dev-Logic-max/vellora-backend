import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { SessionService } from './session.service';

/**
 * `GET /api/me` — the principal resolved from the bearer token: identity,
 * memberships, and the active tenant context. The frontend session bootstraps
 * from this. Protected by the global SupabaseAuthGuard.
 */
@ApiTags('auth')
@ApiBearerAuth()
@Controller('me')
export class AuthController {
  constructor(private readonly session: SessionService) {}

  @Get()
  @ApiOperation({ summary: 'Resolve the current user, memberships and active tenant' })
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Revoke all refresh tokens for the current user (sign out everywhere)' })
  logout(@CurrentUser() user: AuthenticatedUser) {
    return this.session.revokeAll(user.supabaseUid);
  }
}
