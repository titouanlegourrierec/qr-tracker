import { z } from "zod";

import {
  DEFAULT_TIMEZONE,
  MAX_LABEL_LENGTH,
  MAX_TARGET_URL_LENGTH,
  QUERY_DATE_MAX,
  QUERY_DATE_MIN,
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

export const linkSchema = z.object({
  slug: slugSchema,
  targetUrl: z.string(),
  label: z.string().nullable(),
  status: linkStatusSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Link = z.infer<typeof linkSchema>;

export const updateLinkRequestSchema = z
  .object({
    targetUrl: targetUrlFieldSchema.optional(),
    status: ownerLinkStatusSchema.optional(),
  })
  .refine((body) => body.targetUrl !== undefined || body.status !== undefined, {
    message: "At least one of targetUrl or status is required",
  });
export type UpdateLinkRequest = z.infer<typeof updateLinkRequestSchema>;

export const adminStatusRequestSchema = z.object({
  status: z.enum(["active", "blocked"]),
});
export type AdminStatusRequest = z.infer<typeof adminStatusRequestSchema>;

const queryDateSchema = z.iso
  .date()
  .refine((date) => date >= QUERY_DATE_MIN && date <= QUERY_DATE_MAX, {
    message: `Date must be between ${QUERY_DATE_MIN} and ${QUERY_DATE_MAX}`,
  });

export const statsQuerySchema = z
  .object({
    from: queryDateSchema.optional(),
    to: queryDateSchema.optional(),
    tz: z
      .string()
      .refine(isValidTimezone, { message: "Unknown timezone" })
      .default(DEFAULT_TIMEZONE),
    includeBots: z.stringbool().default(false),
  })
  .refine((q) => q.from === undefined || q.to === undefined || q.from <= q.to, {
    message: "from must be before to",
  });
export type StatsQuery = z.infer<typeof statsQuerySchema>;

export const exportQuerySchema = z
  .object({
    from: queryDateSchema.optional(),
    to: queryDateSchema.optional(),
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
  topCities: z.array(topEntrySchema),
  topDevices: z.array(topEntrySchema),
  topOs: z.array(topEntrySchema),
  topBrowsers: z.array(topEntrySchema),
  topLanguages: z.array(topEntrySchema),
  topIsps: z.array(topEntrySchema),
});
export type StatsResponse = z.infer<typeof statsResponseSchema>;
