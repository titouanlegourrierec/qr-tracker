import { z } from "zod";

import {
  DEFAULT_TIMEZONE,
  MAX_LABEL_LENGTH,
  MAX_REPORT_DETAILS_LENGTH,
  MAX_TARGET_URL_LENGTH,
  QUERY_DATE_MAX,
  QUERY_DATE_MIN,
  SUMMARY_MAX_LINKS,
} from "./constants.js";

/** True when the string names a timezone the runtime's ICU data knows about. */
export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Canonical name of a valid timezone: case variants and aliases collapse to one spelling
 * ("eUrOpE/pArIs" → "Europe/Paris", "GMT" → "UTC").
 */
export function canonicalTimezone(tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz }).resolvedOptions().timeZone;
}

// Keep in sync with SLUG_LENGTH / SECRET_KEY_LENGTH (asserted in tests).
export const slugSchema = z.string().regex(/^[0-9A-Za-z]{7}$/);
export const secretKeySchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

/**
 * active: redirects normally · disabled: paused by the owner ·
 * blocked: kill-switched by the operator — only the admin API can set or clear it.
 */
export const linkStatusSchema = z.enum(["active", "disabled", "blocked"]);
export type LinkStatus = z.infer<typeof linkStatusSchema>;

/** Statuses the link owner may set. */
export const ownerLinkStatusSchema = z.enum(["active", "disabled"]);

const targetUrlFieldSchema = z.string().trim().min(1).max(MAX_TARGET_URL_LENGTH);
const labelFieldSchema = z.string().trim().min(1).max(MAX_LABEL_LENGTH);

export const createLinkRequestSchema = z.object({
  // Syntactic bound only — semantic rules (protocol, private hosts…) are enforced by
  // validateTargetUrl so the API can answer with the dedicated TARGET_URL_INVALID code.
  targetUrl: targetUrlFieldSchema,
  label: labelFieldSchema.optional(),
  turnstileToken: z.string().min(1).max(4096),
});
export type CreateLinkRequest = z.infer<typeof createLinkRequestSchema>;

export const createLinkResponseSchema = z.object({
  slug: slugSchema,
  shortUrl: z.url(),
  secretKey: secretKeySchema,
});
export type CreateLinkResponse = z.infer<typeof createLinkResponseSchema>;

/**
 * owner: the secret key — full control · viewer: a read-only key the owner shared, which
 * opens the statistics and the export but cannot change or delete the link.
 */
export const linkAccessSchema = z.enum(["owner", "viewer"]);
export type LinkAccess = z.infer<typeof linkAccessSchema>;

export const linkSchema = z.object({
  slug: slugSchema,
  targetUrl: z.string(),
  label: z.string().nullable(),
  status: linkStatusSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  /** What the key used for this request may do. */
  access: linkAccessSchema,
  /** Whether a read-only key currently exists. */
  hasViewKey: z.boolean(),
});
export type Link = z.infer<typeof linkSchema>;

/** A new read-only key, returned once (only its hash is stored). */
export const viewKeyResponseSchema = z.object({ viewKey: secretKeySchema });
export type ViewKeyResponse = z.infer<typeof viewKeyResponseSchema>;

export const updateLinkRequestSchema = z
  .object({
    targetUrl: targetUrlFieldSchema.optional(),
    status: ownerLinkStatusSchema.optional(),
  })
  .refine((body) => body.targetUrl !== undefined || body.status !== undefined, {
    message: "At least one of targetUrl or status is required",
  });
export type UpdateLinkRequest = z.infer<typeof updateLinkRequestSchema>;

export const reportReasonSchema = z.enum(["phishing", "malware", "spam", "illegal", "other"]);
export type ReportReason = z.infer<typeof reportReasonSchema>;

/** Anyone can report a QR code (Turnstile-protected): no account, no key. */
export const createReportRequestSchema = z.object({
  slug: slugSchema,
  reason: reportReasonSchema,
  details: z.string().trim().max(MAX_REPORT_DETAILS_LENGTH).optional(),
  turnstileToken: z.string().min(1).max(4096),
});
export type CreateReportRequest = z.infer<typeof createReportRequestSchema>;

export const createReportResponseSchema = z.object({ received: z.literal(true) });
export type CreateReportResponse = z.infer<typeof createReportResponseSchema>;

export const adminStatusRequestSchema = z.object({
  status: z.enum(["active", "blocked"]),
});
export type AdminStatusRequest = z.infer<typeof adminStatusRequestSchema>;

const queryDateSchema = z.iso
  .date()
  .refine((date) => date >= QUERY_DATE_MIN && date <= QUERY_DATE_MAX, {
    message: `Date must be between ${QUERY_DATE_MIN} and ${QUERY_DATE_MAX}`,
  });

/**
 * IANA timezone the `from`/`to` dates are read in (the dashboard sends the browser's),
 * canonicalized so spelling variants share one cached formatter in the worker.
 */
const timezoneQuerySchema = z
  .string()
  .refine(isValidTimezone, { message: "Unknown timezone" })
  .transform(canonicalTimezone)
  .default(DEFAULT_TIMEZONE);

export const statsQuerySchema = z
  .object({
    from: queryDateSchema.optional(),
    to: queryDateSchema.optional(),
    tz: timezoneQuerySchema,
    includeBots: z.stringbool().default(false),
  })
  .refine((q) => q.from === undefined || q.to === undefined || q.from <= q.to, {
    message: "from must be before to",
  });
export type StatsQuery = z.infer<typeof statsQuerySchema>;

/** Same filters as the dashboard, so a "7 days" export holds the scans it counts. */
export const exportQuerySchema = z
  .object({
    from: queryDateSchema.optional(),
    to: queryDateSchema.optional(),
    tz: timezoneQuerySchema,
    includeBots: z.stringbool().default(false),
  })
  .refine((q) => q.from === undefined || q.to === undefined || q.from <= q.to, {
    message: "from must be before to",
  });
export type ExportQuery = z.infer<typeof exportQuerySchema>;

export const deviceTypeSchema = z.enum(["mobile", "tablet", "desktop", "other"]);
export type DeviceType = z.infer<typeof deviceTypeSchema>;

export const topEntrySchema = z.object({
  value: z.string().nullable(),
  count: z.number().int().nonnegative(),
});
export type TopEntry = z.infer<typeof topEntrySchema>;

/** Cities are ranked per country, so homonyms (Paris, FR / Paris, US) stay apart. */
export const topCityEntrySchema = topEntrySchema.extend({ country: z.string().nullable() });
export type TopCityEntry = z.infer<typeof topCityEntrySchema>;

const countSchema = z.number().int().nonnegative();

export const dayPointSchema = z.object({
  date: z.iso.date(),
  scans: countSchema,
  uniqueVisitors: countSchema,
});
export type DayPoint = z.infer<typeof dayPointSchema>;

export const hourPointSchema = z.object({
  // Local (requested-tz) hour bucket, e.g. "2026-09-28T14:00".
  hour: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:00$/),
  scans: countSchema,
});
export type HourPoint = z.infer<typeof hourPointSchema>;

export const statsResponseSchema = z.object({
  range: z.object({
    from: z.iso.date(),
    to: z.iso.date(),
    tz: z.string(),
    includeBots: z.boolean(),
  }),
  totals: z.object({
    scans: countSchema,
    uniqueVisitors: countSchema,
    firstScanAt: z.iso.datetime().nullable(),
    lastScanAt: z.iso.datetime().nullable(),
  }),
  byDay: z.array(dayPointSchema),
  /** Per-hour series; null when the range exceeds HOUR_SERIES_MAX_DAYS. */
  byHour: z.array(hourPointSchema).nullable(),
  /** Scan counts indexed by local hour of day (0–23). */
  hourOfDay: z.array(countSchema).length(24),
  /** Scan counts indexed by local day of week, 0 = Monday … 6 = Sunday. */
  dayOfWeek: z.array(countSchema).length(7),
  topCountries: z.array(topEntrySchema),
  topCities: z.array(topCityEntrySchema),
  topDevices: z.array(topEntrySchema),
  topOs: z.array(topEntrySchema),
  topBrowsers: z.array(topEntrySchema),
  topLanguages: z.array(topEntrySchema),
  /**
   * Deprecated, always empty: network operators are no longer collected (1.3.0). Kept so
   * web app versions cached before that release still accept the response; remove later.
   */
  topIsps: z.array(topEntrySchema).max(0),
});
export type StatsResponse = z.infer<typeof statsResponseSchema>;

/** "My QR codes": one request summarizes every code kept in the browser, each with its key. */
export const linkSummariesRequestSchema = z.object({
  links: z
    .array(z.object({ slug: slugSchema, secretKey: secretKeySchema }))
    .min(1)
    .max(SUMMARY_MAX_LINKS),
});
export type LinkSummariesRequest = z.infer<typeof linkSummariesRequestSchema>;

export const linkSummarySchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    slug: slugSchema,
    status: linkStatusSchema,
    /** Scans by people (bots and link previews excluded) still within the retention period. */
    scans: countSchema,
    lastScanAt: z.iso.datetime().nullable(),
  }),
  z.object({
    ok: z.literal(false),
    slug: slugSchema,
    /** NOT_FOUND: the link was deleted · UNAUTHORIZED: the key kept for it is wrong. */
    error: z.enum(["NOT_FOUND", "UNAUTHORIZED"]),
  }),
]);
export type LinkSummary = z.infer<typeof linkSummarySchema>;

/** Summaries come back in the order of the request. */
export const linkSummariesResponseSchema = z.object({ summaries: z.array(linkSummarySchema) });
export type LinkSummariesResponse = z.infer<typeof linkSummariesResponseSchema>;
