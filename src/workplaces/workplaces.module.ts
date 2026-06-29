import { Module } from '@nestjs/common';
import { FactoriesController } from './factories.controller';
import { FactoriesService } from './factories.service';
import { OfficesController } from './offices.controller';
import { OfficesService } from './offices.service';

/** Offices + Factories workplace modules (mirror Stores). */
@Module({
  controllers: [OfficesController, FactoriesController],
  providers: [OfficesService, FactoriesService],
  exports: [OfficesService, FactoriesService],
})
export class WorkplacesModule {}
