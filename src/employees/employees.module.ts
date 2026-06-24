import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ActivationRequestsRepository } from './activation-requests.repository';
import { ActivationRequestsService } from './activation-requests.service';
import { EmployeesController } from './employees.controller';
import { EmployeesRepository } from './employees.repository';
import { EmployeesService } from './employees.service';

@Module({
  imports: [BillingModule, NotificationsModule],
  controllers: [EmployeesController],
  providers: [
    EmployeesService,
    EmployeesRepository,
    ActivationRequestsService,
    ActivationRequestsRepository,
  ],
  exports: [EmployeesService, EmployeesRepository],
})
export class EmployeesModule {}
