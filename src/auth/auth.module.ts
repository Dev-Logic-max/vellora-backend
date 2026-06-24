import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RegistrationController } from './registration.controller';
import { RegistrationService } from './registration.service';
import { SessionService } from './session.service';
import { SupabaseAuthGuard } from './supabase-auth.guard';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';

/**
 * Registers SupabaseAuthGuard as a global guard: every route requires a valid
 * bearer token unless annotated with `@Public()`. AuthService is exported for
 * reuse (e.g. websocket/auth-context resolution) elsewhere. Public registration
 * lives here too (creates the owner + a pending company).
 */
@Module({
  controllers: [AuthController, RegistrationController],
  providers: [
    AuthService,
    SessionService,
    RegistrationService,
    RateLimitGuard,
    {
      provide: APP_GUARD,
      useClass: SupabaseAuthGuard,
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}
