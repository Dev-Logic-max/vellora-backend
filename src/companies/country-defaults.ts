/**
 * Country-first defaults (point 17). When a company is created with a country
 * but no explicit currency/timezone, derive sensible defaults from the country
 * so everything downstream (currency, time) lines up with where they operate.
 *
 * This is a pragmatic subset covering the common markets; anything not listed
 * falls back to USD / UTC and the user can override. The frontend sends a more
 * complete currency via `country-to-currency`, so this is mainly a safety net.
 */
interface CountryDefault {
  currency: string;
  timezone: string;
}

const COUNTRY_DEFAULTS: Record<string, CountryDefault> = {
  US: { currency: 'USD', timezone: 'America/New_York' },
  CA: { currency: 'CAD', timezone: 'America/Toronto' },
  GB: { currency: 'GBP', timezone: 'Europe/London' },
  IE: { currency: 'EUR', timezone: 'Europe/Dublin' },
  DE: { currency: 'EUR', timezone: 'Europe/Berlin' },
  FR: { currency: 'EUR', timezone: 'Europe/Paris' },
  ES: { currency: 'EUR', timezone: 'Europe/Madrid' },
  IT: { currency: 'EUR', timezone: 'Europe/Rome' },
  NL: { currency: 'EUR', timezone: 'Europe/Amsterdam' },
  PT: { currency: 'EUR', timezone: 'Europe/Lisbon' },
  CH: { currency: 'CHF', timezone: 'Europe/Zurich' },
  SE: { currency: 'SEK', timezone: 'Europe/Stockholm' },
  NO: { currency: 'NOK', timezone: 'Europe/Oslo' },
  DK: { currency: 'DKK', timezone: 'Europe/Copenhagen' },
  PL: { currency: 'PLN', timezone: 'Europe/Warsaw' },
  AE: { currency: 'AED', timezone: 'Asia/Dubai' },
  SA: { currency: 'SAR', timezone: 'Asia/Riyadh' },
  QA: { currency: 'QAR', timezone: 'Asia/Qatar' },
  IN: { currency: 'INR', timezone: 'Asia/Kolkata' },
  PK: { currency: 'PKR', timezone: 'Asia/Karachi' },
  SG: { currency: 'SGD', timezone: 'Asia/Singapore' },
  AU: { currency: 'AUD', timezone: 'Australia/Sydney' },
  NZ: { currency: 'NZD', timezone: 'Pacific/Auckland' },
  JP: { currency: 'JPY', timezone: 'Asia/Tokyo' },
  BR: { currency: 'BRL', timezone: 'America/Sao_Paulo' },
  MX: { currency: 'MXN', timezone: 'America/Mexico_City' },
  ZA: { currency: 'ZAR', timezone: 'Africa/Johannesburg' },
  EG: { currency: 'EGP', timezone: 'Africa/Cairo' },
  NG: { currency: 'NGN', timezone: 'Africa/Lagos' },
};

const FALLBACK: CountryDefault = { currency: 'USD', timezone: 'UTC' };

/** Currency + timezone defaults for an ISO-3166 alpha-2 country code. */
export function defaultsForCountry(country: string | undefined): CountryDefault {
  if (!country) return FALLBACK;
  return COUNTRY_DEFAULTS[country.toUpperCase()] ?? FALLBACK;
}
