import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { RateLimit, RateLimitGuard } from '../common/guards/rate-limit.guard';
import { BillingService } from './billing.service';

/**
 * PUBLIC plan catalogue — feeds the registration + company-create pricing cards.
 * Read-only, active plans only, rate-limited per IP. No tenant context.
 */
@ApiTags('billing')
@Public()
@Controller('plans')
@UseGuards(RateLimitGuard)
export class PlansPublicController {
  constructor(private readonly billing: BillingService) {}

  @Get()
  @RateLimit({ limit: 60, windowMs: 60_000 })
  list() {
    return this.billing.listPublicPlans();
  }
}
