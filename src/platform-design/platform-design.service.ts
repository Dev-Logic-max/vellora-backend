import { Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { platformDesignSettings } from '../database/schema';
import type { UpdateDesignDto } from './dto/platform-design.dto';

const SINGLETON_KEY = 'default';

/** Sparse semantic-token overrides `{ '--token': 'R G B' }`. */
type TokenMap = Record<string, string>;
export type CalendarStyle = 'grid' | 'roster';
export interface DesignPrefs {
  density?: 'comfortable' | 'compact';
  motion?: boolean;
  tabsIcons?: boolean;
}
export interface ActiveDesign {
  themeKey: string;
  tokens: TokenMap;
  calendarStyle: CalendarStyle;
  prefs: DesignPrefs;
}
const DEFAULT_DESIGN: ActiveDesign = {
  themeKey: 'indigo',
  tokens: {},
  calendarStyle: 'grid',
  prefs: {},
};

/**
 * Platform design settings (design module) — GLOBAL config, read on the
 * privileged connection (no tenant scope). Holds the active theme key + a sparse
 * map of overridden SEMANTIC tokens applied platform-wide on top of Aurora.
 * Degrades gracefully if the table/row is missing (returns Aurora defaults), so
 * the app still renders before the migration is applied.
 */
@Injectable()
export class PlatformDesignService {
  private readonly logger = new Logger(PlatformDesignService.name);

  constructor(private readonly db: DatabaseService) {}

  /** Current active design (default accent if unset/unavailable). */
  async get(): Promise<ActiveDesign> {
    try {
      const row = await this.db.db.query.platformDesignSettings.findFirst({
        where: eq(platformDesignSettings.key, SINGLETON_KEY),
      });
      if (!row) return DEFAULT_DESIGN;
      return {
        themeKey: row.themeKey,
        tokens: (row.tokens ?? {}) as TokenMap,
        calendarStyle: (row.calendarStyle as CalendarStyle) ?? 'grid',
        prefs: (row.prefs ?? {}) satisfies DesignPrefs,
      };
    } catch (err) {
      this.logger.warn(`design settings unavailable, serving defaults: ${String(err)}`);
      return DEFAULT_DESIGN;
    }
  }

  /** Upsert the singleton; merges/replaces theme key + token overrides. */
  async update(dto: UpdateDesignDto, userId?: string): Promise<ActiveDesign> {
    const patch = {
      ...(dto.themeKey !== undefined ? { themeKey: dto.themeKey } : {}),
      ...(dto.tokens !== undefined ? { tokens: dto.tokens } : {}),
      ...(dto.calendarStyle !== undefined ? { calendarStyle: dto.calendarStyle } : {}),
      ...(dto.prefs !== undefined ? { prefs: dto.prefs } : {}),
      updatedBy: userId ?? null,
    };
    await this.db.db
      .insert(platformDesignSettings)
      .values({ key: SINGLETON_KEY, ...patch })
      .onConflictDoUpdate({ target: platformDesignSettings.key, set: patch });
    return this.get();
  }

  /** Restore the default accent (clears overrides + UI prefs + calendar style). */
  async reset(userId?: string): Promise<ActiveDesign> {
    return this.update(
      { themeKey: 'indigo', tokens: {}, calendarStyle: 'grid', prefs: {} },
      userId,
    );
  }
}
