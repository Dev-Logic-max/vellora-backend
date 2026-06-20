import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { SupabaseAuthGuard } from './supabase-auth.guard';

/**
 * Registers SupabaseAuthGuard as a global guard: every route requires a valid
 * bearer token unless annotated with `@Public()`. AuthService is exported for
 * reuse (e.g. websocket/auth-context resolution) elsewhere.
 */
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionService,
    {
      provide: APP_GUARD,
      useClass: SupabaseAuthGuard,
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}
