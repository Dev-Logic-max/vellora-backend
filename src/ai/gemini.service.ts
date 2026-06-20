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

const MODEL = 'gemini-2.0-flash';
const ENDPOINT = (model: string, key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

/**
 * Server-only Gemini wrapper (GEMINI_API_KEY). Calls the REST `generateContent`
 * endpoint via fetch — no SDK dependency. Without a key, every method returns a
 * deterministic STUB so AI-dependent flows stay testable. All inputs are
 * untrusted (truncated + sent as data, never as instructions to elevate), and
 * outputs are shape-validated here before returning.
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

  /**
   * Single-prompt completion. `jsonOnly` asks the model for raw JSON (parsed by
   * the caller). Returns null on any error so callers can fall back to a stub.
   */
  private async generate(prompt: string, jsonOnly = false): Promise<string | null> {
    if (!this.apiKey) return null;
    try {
      const res = await fetch(ENDPOINT(MODEL, this.apiKey), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: jsonOnly ? { responseMimeType: 'application/json' } : {},
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        this.logger.warn(`Gemini ${res.status}: ${await res.text()}`);
        return null;
      }
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      return data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
    } catch (err) {
      this.logger.warn(`Gemini request failed: ${(err as Error).message}`);
      return null;
    }
  }

  /** Parse raw resume text → structured fields. */
  async parseResume(text: string): Promise<ParsedResumeResult> {
    const fallback: ParsedResumeResult = {
      summary: 'Resume parsing is available once Gemini is configured.',
      skills: [],
      experienceYears: 0,
      education: '',
    };
    const out = await this.generate(
      `Extract structured fields from this resume as JSON with keys ` +
        `summary (string), skills (string[]), experienceYears (number), education (string). ` +
        `Resume:\n"""${text.slice(0, 12_000)}"""`,
      true,
    );
    if (!out) return fallback;
    try {
      const parsed = JSON.parse(out) as Partial<ParsedResumeResult>;
      return {
        summary: typeof parsed.summary === 'string' ? parsed.summary : '',
        skills: Array.isArray(parsed.skills) ? parsed.skills.slice(0, 50).map(String) : [],
        experienceYears: Number.isFinite(parsed.experienceYears)
          ? Number(parsed.experienceYears)
          : 0,
        education: typeof parsed.education === 'string' ? parsed.education : '',
      };
    } catch {
      return fallback;
    }
  }

  /** Score a candidate (0–100) against a job. */
  async scoreCandidate(job: string, candidate: string): Promise<ScoreResult> {
    const out = await this.generate(
      `Score how well this candidate fits the job from 0 to 100. Respond as JSON ` +
        `{ "score": number, "rationale": string }.\nJob:\n"""${job.slice(0, 6000)}"""\n` +
        `Candidate:\n"""${candidate.slice(0, 6000)}"""`,
      true,
    );
    if (!out) return { score: 50, rationale: 'Stub score — configure Gemini for real scoring.' };
    try {
      const parsed = JSON.parse(out) as Partial<ScoreResult>;
      const score = Number(parsed.score);
      return {
        score: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 50,
        rationale: typeof parsed.rationale === 'string' ? parsed.rationale : '',
      };
    } catch {
      return { score: 50, rationale: '' };
    }
  }

  /** Draft a job description from role inputs. */
  async draftJobDescription(input: { title: string; notes?: string }): Promise<string> {
    const out = await this.generate(
      `Write a concise, friendly job description in Markdown for the role "${input.title}".` +
        (input.notes ? ` Context: ${input.notes.slice(0, 2000)}.` : '') +
        ` Include a short intro, responsibilities, and requirements.`,
    );
    return (
      out ??
      [
        `# ${input.title}`,
        '',
        'We are looking for a motivated team member to join us.',
        input.notes ? `\nContext: ${input.notes}` : '',
        '',
        '_Configure Gemini (GEMINI_API_KEY) to generate a tailored description._',
      ].join('\n')
    );
  }

  /** Summarize anomalies/metrics into a short insight string. */
  async summarizeInsights(data: unknown): Promise<string> {
    const out = await this.generate(
      `You are an HR analytics assistant. In 2–4 short sentences, summarize the key ` +
        `insights and any anomalies in this workforce data. Be specific and neutral.\n` +
        `Data (JSON):\n${JSON.stringify(data).slice(0, 8000)}`,
    );
    return out ?? 'AI insights are available once Gemini is configured.';
  }
}
