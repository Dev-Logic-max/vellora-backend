import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';

/**
 * `GET /api/me` — the principal resolved from the bearer token: identity,
 * memberships, and the active tenant context. The frontend session bootstraps
 * from this. Protected by the global SupabaseAuthGuard.
 */
@ApiTags('auth')
@ApiBearerAuth()
@Controller('me')
export class AuthController {
  @Get()
  @ApiOperation({ summary: 'Resolve the current user, memberships and active tenant' })
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}
