import { Global, Module } from '@nestjs/common';
import { GeminiService } from './gemini.service';

/**
 * Server-only AI adapter (Gemini). Global so recruiting + reports can inject
 * GeminiService. The stub degrades gracefully without a key; P9-C swaps in the
 * real model calls behind the same interface.
 */
@Global()
@Module({
  providers: [GeminiService],
  exports: [GeminiService],
})
export class AiModule {}
