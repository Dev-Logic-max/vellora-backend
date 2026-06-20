import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
}

/**
 * Global error shape. HttpExceptions (incl. nestjs-zod's ZodValidationException)
 * keep their status + message; anything else becomes a 500 and is logged with
 * its stack while the client only sees a generic message.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const body: ErrorBody = {
      statusCode: status,
      error: HttpStatus[status] ?? 'ERROR',
      message: this.resolveMessage(exception, status),
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    if (status >= 500) {
      // Structured 500 log with request context — ready for a Sentry transport
      // (set SENTRY_DSN + drop in @sentry/node to forward; no-op without it).
      this.logger.error(
        `${request.method} ${request.url} → ${status} [user=${request.user?.userId ?? 'anon'} company=${request.user?.companyId ?? '-'}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
      this.reportToSentry(exception);
    }

    response.status(status).json(body);
  }

  /**
   * Forwards an error to Sentry when both `SENTRY_DSN` and `@sentry/node` are
   * available. Loaded dynamically so the SDK stays an OPTIONAL dependency — the
   * app builds and runs without it. Drop in `@sentry/node` to activate.
   */
  private reportToSentry(exception: unknown): void {
    if (!process.env.SENTRY_DSN) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Sentry = require('@sentry/node') as {
        captureException?: (e: unknown) => void;
      };
      Sentry.captureException?.(exception);
    } catch {
      // @sentry/node not installed — silently skip (DSN set but no transport).
    }
  }

  private resolveMessage(exception: unknown, status: number): string | string[] {
    if (status >= 500) {
      return 'Internal server error';
    }
    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      if (typeof res === 'string') {
        return res;
      }
      if (res && typeof res === 'object' && 'message' in res) {
        return (res as { message: string | string[] }).message;
      }
      return exception.message;
    }
    return 'Unexpected error';
  }
}
