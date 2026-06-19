import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Platform-wide design settings (GLOBAL config — no company_id, no RLS), managed
 * by the platform admin (super_admin plane, added later). A singleton row
 * (`key = 'default'`) holds the active theme key + a sparse map of overridden
 * SEMANTIC tokens (`{ '--accent': '79 70 229', ... }`, space-separated R G B).
 * The frontend applies these on top of the Aurora defaults via CSS variables.
 * Token VALUES only override the semantic layer — primitives are never stored
 * here. See .claude/docs/design-theme-system.md.
 */
export const platformDesignSettings = pgTable('platform_design_settings', {
  id: uuid('id').defaultRandom().primaryKey(),
  /** Singleton discriminator — always 'default' for the active platform design. */
  key: text('key').notNull().unique().default('default'),
  /** Active theme key (e.g. 'aurora'); extra theme packs come later (plan-gated). */
  themeKey: text('theme_key').notNull().default('aurora'),
  /** Sparse semantic-token overrides `{ '--token': 'R G B' }`; {} = pure Aurora. */
  tokens: jsonb('tokens').notNull().default({}),
  /** User id of the last editor (no FK — platform plane is cross-tenant). */
  updatedBy: uuid('updated_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type PlatformDesignSettings = typeof platformDesignSettings.$inferSelect;
export type NewPlatformDesignSettings = typeof platformDesignSettings.$inferInsert;
