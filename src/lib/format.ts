/**
 * # format.ts - small display helpers shared by the list and detail views
 */

// "3m", "2h", "4d": how long ago (or, with future dates, how long until) a moment is.
export function shortDuration(ms: number): string {
  const m = Math.max(0, Math.round(Math.abs(ms) / 60_000));
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h` : `${Math.round(h / 24)}d`;
}

// Turn an enum value like "under_1_month" into "under 1 month".
export function humanize(value: string): string {
  return value.replaceAll("_", " ");
}
