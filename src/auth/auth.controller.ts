import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';

@Controller('auth')
export class AuthController {
  /**
   * Echoes the principal resolved from the bearer token. Useful for verifying
   * JWT wiring end-to-end. Protected by the global SupabaseAuthGuard.
   */
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}
