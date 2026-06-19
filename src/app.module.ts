import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ZodValidationPipe } from 'nestjs-zod';
import { AttendanceModule } from './attendance/attendance.module';
import { AiModule } from './ai/ai.module';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { BillingModule } from './billing/billing.module';
import { RecruitingModule } from './recruiting/recruiting.module';
import { CommonModule } from './common/common.module';
import { DevicesModule } from './devices/devices.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TenantInterceptor } from './common/tenant/tenant.interceptor';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { CompaniesModule } from './companies/companies.module';
import { DatabaseModule } from './database/database.module';
import { DocumentsModule } from './documents/documents.module';
import { EmployeesModule } from './employees/employees.module';
import { EntitlementsModule } from './entitlements/entitlements.module';
import { GroupsModule } from './groups/groups.module';
import { HealthModule } from './health/health.module';
import { InfraModule } from './infra/infra.module';
import { LeaveModule } from './leave/leave.module';
import { MessagingModule } from './messaging/messaging.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { RealtimeModule } from './realtime/realtime.module';
import { SchedulingModule } from './scheduling/scheduling.module';
import { TransfersModule } from './transfers/transfers.module';
import { PermissionsModule } from './permissions/permissions.module';
import { PlatformDesignModule } from './platform-design/platform-design.module';
import { SearchModule } from './search/search.module';
import { StoresModule } from './stores/stores.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validate: validateEnv,
      envFilePath: ['.env'],
    }),
    DatabaseModule,
    CommonModule,
    AuditModule,
    InfraModule,
    AiModule,
    RealtimeModule,
    PermissionsModule,
    EntitlementsModule,
    AuthModule,
    HealthModule,
    CompaniesModule,
    GroupsModule,
    StoresModule,
    EmployeesModule,
    SchedulingModule,
    AttendanceModule,
    DevicesModule,
    LeaveModule,
    OnboardingModule,
    TransfersModule,
    NotificationsModule,
    DocumentsModule,
    MessagingModule,
    SearchModule,
    BillingModule,
    RecruitingModule,
    PlatformDesignModule,
  ],
  providers: [
    // Validates request DTOs declared with `createZodDto`; passes everything
    // else through untouched.
    {
      provide: APP_PIPE,
      useClass: ZodValidationPipe,
    },
    // Consistent error envelope for every response.
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    // Opens the per-request tenant scope (AsyncLocalStorage) for authenticated
    // requests. Global so it wraps every route after the auth guard runs.
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantInterceptor,
    },
  ],
})
export class AppModule {}
