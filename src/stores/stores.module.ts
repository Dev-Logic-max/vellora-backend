import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { PosCompanyController } from './pos-company.controller';
import { PosController } from './pos.controller';
import { PosService } from './pos.service';
import { StoresController } from './stores.controller';
import { StoresService } from './stores.service';

@Module({
  imports: [BillingModule],
  controllers: [StoresController, PosController, PosCompanyController],
  providers: [StoresService, PosService],
  exports: [StoresService],
})
export class StoresModule {}
