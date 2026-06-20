import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CompanyId } from '../common/decorators/company-id.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { BillingService } from './billing.service';
import { CheckoutDto } from './dto/billing.dto';

/**
 * Tenant-facing billing (15-billing §11). Owner-only — the plan/seat decisions
 * belong to the account holder. Plans are global; everything else is RLS-scoped.
 */
@ApiTags('billing')
@ApiBearerAuth()
@Controller('billing')
@UseGuards(TenantGuard, RolesGuard)
@Roles('owner')
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly entitlements: EntitlementsService,
  ) {}

  @Get('plans')
  plans() {
    return this.billing.listPlans();
  }

  @Get('subscription')
  subscription(@CompanyId() companyId: string) {
    return this.billing.getSubscription(companyId);
  }

  @Get('entitlements')
  effective(@CompanyId() companyId: string) {
    return this.entitlements.getEffective(companyId);
  }

  @Get('usage')
  usage(@CompanyId() companyId: string) {
    return this.billing.getUsage(companyId);
  }

  @Get('invoices')
  invoices(@CompanyId() companyId: string) {
    return this.billing.listInvoices(companyId);
  }

  @Get('invoices/:id/pdf')
  invoicePdf(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.billing.getInvoicePdf(companyId, id);
  }

  @Post('checkout')
  checkout(@CompanyId() companyId: string, @Body() dto: CheckoutDto) {
    return this.billing.createCheckout(companyId, dto);
  }

  @Post('change-plan')
  changePlan(@CompanyId() companyId: string, @Body() dto: CheckoutDto) {
    return this.billing.changePlan(companyId, dto);
  }

  @Post('portal')
  portal(@CompanyId() companyId: string) {
    return this.billing.createPortal(companyId);
  }

  // ── job triggers (BullMQ; nightly in prod, manual/test here) ────────────────
  @Post('jobs/usage-sync')
  syncUsage() {
    return this.billing.enqueueUsageSync();
  }

  @Post('jobs/trial-reminders')
  trialReminders() {
    return this.billing.enqueueTrialReminders();
  }
}
