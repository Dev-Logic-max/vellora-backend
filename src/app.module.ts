import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ZodValidationPipe } from 'nestjs-zod';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { CommonModule } from './common/common.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TenantInterceptor } from './common/tenant/tenant.interceptor';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { CompaniesModule } from './companies/companies.module';
import { DatabaseModule } from './database/database.module';
import { EmployeesModule } from './employees/employees.module';
import { EntitlementsModule } from './entitlements/entitlements.module';
import { GroupsModule } from './groups/groups.module';
import { HealthModule } from './health/health.module';
import { SchedulingModule } from './scheduling/scheduling.module';
import { PermissionsModule } from './permissions/permissions.module';
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
    PermissionsModule,
    EntitlementsModule,
    AuthModule,
    HealthModule,
    CompaniesModule,
    GroupsModule,
    StoresModule,
    EmployeesModule,
    SchedulingModule,
    SearchModule,
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
