import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration';

export interface ParsedResumeResult {
  summary: string;
  skills: string[];
  experienceYears: number;
  education: string;
}

export interface ScoreResult {
  score: number;
  rationale: string;
}

/**
 * Server-only Gemini wrapper (GEMINI_API_KEY). Phase 9-A wires the recruiting AI
 * hooks against this interface; the real model calls are implemented in P9-C.
 * Until a key + client exist, every method returns a deterministic STUB so the
 * recruiting flows are fully testable without the AI provider. All inputs are
 * treated as untrusted and outputs are shape-validated by the caller.
 */
@Injectable()
export class GeminiService {
  protected readonly logger = new Logger(GeminiService.name);
  protected readonly apiKey?: string;

  constructor(config: ConfigService<AppConfig, true>) {
    this.apiKey = config.get('gemini.apiKey', { infer: true });
    if (!this.apiKey) {
      this.logger.warn('GEMINI_API_KEY unset — AI features return deterministic stubs.');
    }
  }

  get enabled(): boolean {
    return Boolean(this.apiKey);
  }

  /** Parse raw resume text → structured fields. Stub returns a neutral shape. */
  parseResume(_text: string): Promise<ParsedResumeResult> {
    void _text;
    return Promise.resolve({
      summary: 'Resume parsing is available once Gemini is configured.',
      skills: [],
      experienceYears: 0,
      education: '',
    });
  }

  /** Score a candidate (0–100) against a job. Stub returns a mid score. */
  scoreCandidate(_job: string, _candidate: string): Promise<ScoreResult> {
    void _job;
    void _candidate;
    return Promise.resolve({
      score: 50,
      rationale: 'Stub score — configure Gemini for real scoring.',
    });
  }

  /** Draft a job description from role inputs. Stub echoes a template. */
  draftJobDescription(input: { title: string; notes?: string }): Promise<string> {
    return Promise.resolve(
      [
        `# ${input.title}`,
        '',
        'We are looking for a motivated team member to join us.',
        input.notes ? `\nContext: ${input.notes}` : '',
        '',
        '_Configure Gemini (GEMINI_API_KEY) to generate a tailored description._',
      ].join('\n'),
    );
  }

  /** Summarize anomalies/metrics into an insight string. Stub returns a note. */
  summarizeInsights(_data: unknown): Promise<string> {
    void _data;
    return Promise.resolve('AI insights are available once Gemini is configured.');
  }
}
