import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ZodValidationPipe } from 'nestjs-zod';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TenantInterceptor } from './common/tenant/tenant.interceptor';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { CompaniesModule } from './companies/companies.module';
import { DatabaseModule } from './database/database.module';
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
