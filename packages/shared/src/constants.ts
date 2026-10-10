/** Base62 alphabet used for public slugs. */
export const SLUG_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** Length of a public slug (base62 → 62^7 ≈ 3.5e12 combinations). */
export const SLUG_LENGTH = 7;

/** Secret keys are 256 bits from a CSPRNG… */
export const SECRET_KEY_BYTES = 32;

/** …encoded as unpadded base64url (32 bytes → 43 chars). */
export const SECRET_KEY_LENGTH = 43;

export const MAX_TARGET_URL_LENGTH = 2048;
export const MAX_LABEL_LENGTH = 100;

export const DEFAULT_TIMEZONE = "Europe/Paris";

/** Scans older than this are purged by the daily cron (overridable via env). */
export const DEFAULT_RETENTION_DAYS = 365;

/** The per-hour time series is only computed for ranges up to this many days. */
export const HOUR_SERIES_MAX_DAYS = 14;

/** Number of entries in each "top …" stats list. */
export const TOP_LIMIT = 10;

/** Codes per "My QR codes" summary request (the web app splits longer lists). */
export const SUMMARY_MAX_LINKS = 50;

/** Hard cap on CSV export rows (worker memory protection). */
export const EXPORT_MAX_ROWS = 50_000;

/** byDay series is clamped to at most this many days. */
export const STATS_MAX_RANGE_DAYS = 366;

/**
 * Accepted bounds for `from`/`to` query dates (inclusive). Keeps day arithmetic far
 * from year 10000, where ISO strings change shape ("+010000-01-01").
 */
export const QUERY_DATE_MIN = "2000-01-01";
export const QUERY_DATE_MAX = "2099-12-31";

/** Fixed-window rate limits, enforced by the D1-backed limiter. */
export const RATE_LIMITS = {
  /** Link creation, keyed by hashed IP. */
  createLink: { limit: 10, windowSeconds: 3600 },
  /** Stats + management endpoints, keyed by hashed IP + slug. */
  authenticated: { limit: 60, windowSeconds: 60 },
  /** Abuse reports, keyed by hashed IP. */
  report: { limit: 5, windowSeconds: 3600 },
} as const;

/** Free-text details a reporter may add to an abuse report. */
export const MAX_REPORT_DETAILS_LENGTH = 1000;

export type RateLimitScope = keyof typeof RATE_LIMITS;

/** Column order of the CSV export (matches the anonymous scan rows). */
export const CSV_COLUMNS = [
  "scanned_at",
  "country",
  "region",
  "city",
  "timezone",
  "as_organization",
  "device_type",
  "os",
  "browser",
  "language",
  "is_bot",
  "visitor_hash",
] as const;
