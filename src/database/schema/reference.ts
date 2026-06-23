import { boolean, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * GLOBAL reference catalogs (no company_id, no RLS) used by creation forms.
 * Seeded once from the in-repo datasets; tenants read them on the privileged
 * connection. Kept separate from tenant data so they can be shared platform-wide.
 */

/** ISO-4217 currencies — code + display name + symbol (+ optional decimals). */
export const refCurrencies = pgTable('ref_currencies', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  symbol: text('symbol').notNull(),
  decimals: integer('decimals').notNull().default(2),
  /** Representative country (ISO alpha-2) for flag display. */
  countryCode: text('country_code'),
  active: boolean('active').notNull().default(true),
});

/** Per-country bank catalog (name/swift/website/brand color + logo key). */
export const refBanks = pgTable(
  'ref_banks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    /** ISO-3166-1 alpha-2 country. */
    countryCode: text('country_code').notNull(),
    name: text('name').notNull(),
    officialName: text('official_name'),
    swift: text('swift'),
    website: text('website'),
    brandColor: text('brand_color'),
    /** Filename stem under the frontend's public/banks for the logo. */
    logoKey: text('logo_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('ref_banks_country_idx').on(table.countryCode)],
);

export type RefCurrency = typeof refCurrencies.$inferSelect;
export type NewRefCurrency = typeof refCurrencies.$inferInsert;
export type RefBank = typeof refBanks.$inferSelect;
export type NewRefBank = typeof refBanks.$inferInsert;
