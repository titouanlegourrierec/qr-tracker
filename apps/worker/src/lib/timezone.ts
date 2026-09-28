/**
 * Timezone bucketing helpers. SQL aggregates on UTC hours/days; these map the
 * buckets into the requested IANA timezone via Intl (full ICU in workerd).
 *
 * Known limitation (documented): buckets are UTC hours, so counts are exact
 * only for whole-hour-offset timezones; :30/:45 zones can be off by up to an
 * hour at day boundaries.
 */

export interface LocalParts {
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  /** Local hour of day, 0–23. */
  hour: number;
  /** Local day of week, 0 = Monday … 6 = Sunday. */
  dayOfWeek: number;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: string): Intl.DateTimeFormat {
  let fmt = formatterCache.get(tz);
  if (fmt === undefined) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
      hour12: false,
    });
    formatterCache.set(tz, fmt);
  }
  return fmt;
}

interface RawParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: string;
}

function partsAt(instantMs: number, tz: string): RawParts {
  const parts: Partial<RawParts> = {};
  for (const part of formatterFor(tz).formatToParts(instantMs)) {
    if (part.type === "weekday") parts.weekday = part.value;
    else if (part.type !== "literal") {
      const num = Number.parseInt(part.value, 10);
      if (part.type === "year") parts.year = num;
      else if (part.type === "month") parts.month = num;
      else if (part.type === "day") parts.day = num;
      // Intl may render midnight as "24" with hour12: false (hourCycle h24 in some engines).
      else if (part.type === "hour") parts.hour = num === 24 ? 0 : num;
      else if (part.type === "minute") parts.minute = num;
      else if (part.type === "second") parts.second = num;
    }
  }
  return {
    year: parts.year ?? 1970,
    month: parts.month ?? 1,
    day: parts.day ?? 1,
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
    second: parts.second ?? 0,
    weekday: parts.weekday ?? "Mon",
  };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Local calendar parts of a UTC instant in the given timezone. */
export function utcInstantToLocalParts(instantMs: number, tz: string): LocalParts {
  const p = partsAt(instantMs, tz);
  return {
    date: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
    hour: p.hour,
    dayOfWeek: WEEKDAY_INDEX[p.weekday] ?? 0,
  };
}

/** Offset (ms) of `tz` relative to UTC at the given instant. */
function tzOffsetMs(instantMs: number, tz: string): number {
  const p = partsAt(instantMs, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instantMs / 1000) * 1000;
}

/**
 * UTC instant (ms) of local midnight for a YYYY-MM-DD date in `tz`.
 * Two-pass offset resolution handles DST transitions; on a spring-forward day
 * whose midnight does not exist, the result lands inside the skipped hour.
 */
export function localDayStartUtcMs(date: string, tz: string): number {
  const guess = Date.parse(`${date}T00:00:00Z`);
  const first = guess - tzOffsetMs(guess, tz);
  return guess - tzOffsetMs(first, tz);
}

/** Adds days to a YYYY-MM-DD date (pure calendar arithmetic). */
export function addDays(date: string, days: number): string {
  const ms = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Today's date in the given timezone. */
export function localToday(tz: string, nowMs = Date.now()): string {
  return utcInstantToLocalParts(nowMs, tz).date;
}

/** Whole days between two YYYY-MM-DD dates, inclusive. */
export function inclusiveDayCount(from: string, to: string): number {
  return (
    Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1
  );
}

/**
 * Maps a UTC day to the local date containing most of it (its noon).
 * Used to attribute per-UTC-day unique-visitor counts to a local day.
 */
export function utcDayToLocalDate(utcDay: string, tz: string): string {
  return utcInstantToLocalParts(Date.parse(`${utcDay}T12:00:00Z`), tz).date;
}
