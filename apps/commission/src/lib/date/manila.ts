/**
 * Workspace-local time. Timestamps store UTC; every "today", pace, and idle
 * computation resolves against Asia/Manila (Master PRD §6).
 *
 * Built on Intl rather than a date library: the only thing we need is a correct
 * civil date in one fixed zone, and Manila has no DST.
 */

export const MANILA_TZ = "Asia/Manila";

/** `2026-07-17` — a civil calendar date, the shape a Postgres `date` column takes. */
export type CivilDate = string;

const DATE_PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: MANILA_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const DISPLAY_DATE = new Intl.DateTimeFormat("en-PH", {
  timeZone: MANILA_TZ,
  year: "numeric",
  month: "short",
  day: "numeric",
});

const DISPLAY_DATE_TIME = new Intl.DateTimeFormat("en-PH", {
  timeZone: MANILA_TZ,
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** The workspace's civil date for an instant (default: now). */
export function manilaDate(instant: Date = new Date()): CivilDate {
  // en-CA yields ISO-ordered YYYY-MM-DD.
  return DATE_PARTS.format(instant);
}

/** Today in Asia/Manila. The reference date for pace and idle math. */
export function manilaToday(): CivilDate {
  return manilaDate();
}

/** `17 Jul 2026` */
export function formatManilaDate(value: Date | string): string {
  return DISPLAY_DATE.format(toDate(value));
}

/** `17 Jul 2026, 6:35 PM` — for audit-log timestamps. */
export function formatManilaDateTime(value: Date | string): string {
  return DISPLAY_DATE_TIME.format(toDate(value));
}

/** Calendar year in Manila — the year selector on M7/M8 reports. */
export function manilaYear(value: Date | string = new Date()): number {
  return Number(manilaDate(toDate(value)).slice(0, 4));
}

/**
 * Whole months elapsed between two civil dates, floored — the unit M6's chase
 * flag counts in (`⚠ chase when months idle >= chase_idle_months`).
 */
export function monthsBetween(from: CivilDate, to: CivilDate): number {
  const [fy, fm, fd] = splitCivil(from);
  const [ty, tm, td] = splitCivil(to);
  let months = (ty - fy) * 12 + (tm - fm);
  if (td < fd) months -= 1;
  return months;
}

/** A `date` column value parsed as a Manila civil date, not a UTC instant. */
function toDate(value: Date | string): Date {
  if (value instanceof Date) return value;
  // A bare YYYY-MM-DD parses as UTC midnight, which renders as the previous day
  // in Manila (UTC+8). Pin it to midday so the civil date survives the round trip.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T12:00:00Z`);
  return new Date(value);
}

function splitCivil(value: CivilDate): [number, number, number] {
  const [y, m, d] = value.split("-").map(Number);
  return [y, m, d];
}
