/**
 * Store-timezone day bucketing without a date-fns dependency. Day-boundary math
 * for reports is computed in the STORE tz (i18n-and-time.md), not the server's.
 */

/** The local calendar day (YYYY-MM-DD) for a UTC instant in the given IANA tz. */
export function localDay(instant: Date, timeZone: string): string {
  // en-CA yields ISO-style YYYY-MM-DD; the tz does the UTC→local shift.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/** The local YYYY-MM (month bucket) for a UTC instant in the given IANA tz. */
export function localMonth(instant: Date, timeZone: string): string {
  return localDay(instant, timeZone).slice(0, 7);
}
