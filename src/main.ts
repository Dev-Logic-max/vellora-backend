import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import type { Request, Response } from 'express';
import { AppModule } from './app.module';
import type { AppConfig } from './config/configuration';

async function bootstrap(): Promise<void> {
  // rawBody so the Stripe webhook controller can verify the signature against
  // the exact bytes Stripe signed (Nest still parses JSON for every other route).
  const app = await NestFactory.create(AppModule, { bufferLogs: false, rawBody: true });
  const config: ConfigService<AppConfig, true> = app.get(ConfigService);

  const corsOrigins = config.get('corsOrigins', { infer: true });
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'x-company-id'],
  });

  app.setGlobalPrefix('api', { exclude: ['health'] });
  app.enableShutdownHooks();

  // OpenAPI for frontend type-gen (openapi-typescript). cleanupOpenApiDoc folds
  // in the Zod DTO schemas produced by nestjs-zod's createZodDto.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Vellora API')
    .setDescription('Multi-tenant HR & workforce-management platform API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = cleanupOpenApiDoc(SwaggerModule.createDocument(app, swaggerConfig));
  app.getHttpAdapter().get('/api-json', (_req: Request, res: Response) => res.json(document));

  const port = config.get('port', { infer: true });
  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`Vellora API listening on http://localhost:${port}`);
  logger.log(`Health check:   http://localhost:${port}/health`);
  logger.log(`OpenAPI (JSON): http://localhost:${port}/api-json`);
  logger.log(`CORS origins:   ${corsOrigins.join(', ')}`);
}

void bootstrap();
