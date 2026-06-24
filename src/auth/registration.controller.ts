import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from './public.decorator';
import { RateLimit, RateLimitGuard } from '../common/guards/rate-limit.guard';
import { RegisterDto } from './dto/register.dto';
import { RegistrationService } from './registration.service';

/**
 * PUBLIC self-service registration. Unauthenticated + rate-limited per IP.
 * Creates the owner identity + a `pending` company, owner membership and a
 * trialing subscription on the chosen plan.
 */
@ApiTags('auth')
@Public()
@Controller('auth')
@UseGuards(RateLimitGuard)
export class RegistrationController {
  constructor(private readonly registration: RegistrationService) {}

  @Post('register')
  @HttpCode(201)
  @RateLimit({ limit: 8, windowMs: 60_000 })
  @ApiOperation({
    summary: 'Register a new company + owner (public, pending until email verified)',
  })
  register(@Body() dto: RegisterDto) {
    return this.registration.register(dto);
  }
}
