import { Global, Module } from '@nestjs/common';
import { EntitlementsController } from './entitlements.controller';
import { EntitlementsService } from './entitlements.service';
import { PlanGuard } from './plan.guard';

/** Global so any module can apply PlanGuard / inject EntitlementsService. */
@Global()
@Module({
  controllers: [EntitlementsController],
  providers: [EntitlementsService, PlanGuard],
  exports: [EntitlementsService, PlanGuard],
})
export class EntitlementsModule {}
