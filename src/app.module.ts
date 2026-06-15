import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { TenantInterceptor } from './common/tenant/tenant.interceptor';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { CompaniesModule } from './companies/companies.module';
import { DatabaseModule } from './database/database.module';
import { EmployeesModule } from './employees/employees.module';
import { HealthModule } from './health/health.module';

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
    AuthModule,
    HealthModule,
    CompaniesModule,
    EmployeesModule,
  ],
  providers: [
    // Opens the per-request tenant scope (AsyncLocalStorage) for authenticated
    // requests. Global so it wraps every route after the auth guard runs.
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantInterceptor,
    },
  ],
})
export class AppModule {}
