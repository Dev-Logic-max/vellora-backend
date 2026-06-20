import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

export const RATE_LIMIT_KEY = 'rate_limit';

export interface RateLimitOptions {
  /** Max requests per window. */
  limit: number;
  /** Window length in ms. */
  windowMs: number;
}

/**
 * Annotate a route with a fixed-window rate limit, keyed by client IP:
 *   `@RateLimit({ limit: 10, windowMs: 60_000 })`
 */
export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);

/**
 * Lightweight in-memory fixed-window rate limiter for unauthenticated public
 * endpoints (careers apply/list). No external dep; per-process only — good
 * enough for v1, swap for @nestjs/throttler + Redis when scaling out. Returns
 * 429 with Retry-After when the window is exhausted.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!options) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const ip = request.ip ?? request.socket?.remoteAddress ?? 'unknown';
    const key = `${context.getClass().name}:${context.getHandler().name}:${ip}`;
    const now = Date.now();

    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + options.windowMs });
      this.sweep(now);
      return true;
    }
    if (entry.count >= options.limit) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      throw new HttpException(
        { message: 'Too many requests. Please try again later.', retryAfter },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    entry.count += 1;
    return true;
  }

  /** Opportunistic cleanup of expired windows so the map doesn't grow forever. */
  private sweep(now: number): void {
    if (this.hits.size < 5000) return;
    for (const [key, entry] of this.hits) {
      if (entry.resetAt <= now) this.hits.delete(key);
    }
  }
}
