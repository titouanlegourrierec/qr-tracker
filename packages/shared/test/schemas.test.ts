import { describe, expect, it } from "vitest";

import {
  adminStatusRequestSchema,
  createLinkRequestSchema,
  createLinkResponseSchema,
  DEFAULT_TIMEZONE,
  errorBody,
  errorResponseSchema,
  exportQuerySchema,
  isValidTimezone,
  linkSchema,
  MAX_LABEL_LENGTH,
  QUERY_DATE_MAX,
  QUERY_DATE_MIN,
  SECRET_KEY_LENGTH,
  secretKeySchema,
  SLUG_LENGTH,
  slugSchema,
  statsQuerySchema,
  statsResponseSchema,
  updateLinkRequestSchema,
} from "../src/index.js";

describe("slugSchema / secretKeySchema", () => {
  it("matches the shared length constants", () => {
    expect(slugSchema.safeParse("a".repeat(SLUG_LENGTH)).success).toBe(true);
    expect(secretKeySchema.safeParse("k".repeat(SECRET_KEY_LENGTH)).success).toBe(true);
  });

  it("accepts base62 slugs and rejects anything else", () => {
    expect(slugSchema.safeParse("Ab3xY9z").success).toBe(true);
    expect(slugSchema.safeParse("Ab3xY9").success).toBe(false); // too short
    expect(slugSchema.safeParse("Ab3xY9zz").success).toBe(false); // too long
    expect(slugSchema.safeParse("Ab3xY9_").success).toBe(false); // bad char
  });

  it("accepts base64url keys and rejects base64 padding/chars", () => {
    expect(secretKeySchema.safeParse("Ab-_" + "x".repeat(39)).success).toBe(true);
    expect(secretKeySchema.safeParse("Ab+" + "x".repeat(40)).success).toBe(false);
    expect(secretKeySchema.safeParse("x".repeat(42) + "=").success).toBe(false);
  });
});

describe("createLinkRequestSchema", () => {
  const valid = { targetUrl: "https://example.com", turnstileToken: "tok" };

  it("accepts a minimal valid body and an optional label", () => {
    expect(createLinkRequestSchema.safeParse(valid).success).toBe(true);
    expect(createLinkRequestSchema.safeParse({ ...valid, label: "Poster, hall B" }).success).toBe(
      true,
    );
  });

  it("trims the label and rejects blank or too-long labels", () => {
    const parsed = createLinkRequestSchema.parse({ ...valid, label: "  ok  " });
    expect(parsed.label).toBe("ok");
    expect(createLinkRequestSchema.safeParse({ ...valid, label: "   " }).success).toBe(false);
    expect(
      createLinkRequestSchema.safeParse({ ...valid, label: "x".repeat(MAX_LABEL_LENGTH + 1) })
        .success,
    ).toBe(false);
  });

  it("requires targetUrl and turnstileToken", () => {
    expect(createLinkRequestSchema.safeParse({ targetUrl: "https://a.com" }).success).toBe(false);
    expect(createLinkRequestSchema.safeParse({ turnstileToken: "tok" }).success).toBe(false);
    expect(createLinkRequestSchema.safeParse({ ...valid, targetUrl: "" }).success).toBe(false);
  });
});

describe("updateLinkRequestSchema", () => {
  it("requires at least one field", () => {
    expect(updateLinkRequestSchema.safeParse({}).success).toBe(false);
    expect(updateLinkRequestSchema.safeParse({ status: "disabled" }).success).toBe(true);
    expect(updateLinkRequestSchema.safeParse({ targetUrl: "https://example.org" }).success).toBe(
      true,
    );
  });

  it("rejects unknown statuses", () => {
    expect(updateLinkRequestSchema.safeParse({ status: "paused" }).success).toBe(false);
  });
});

describe("statsQuerySchema", () => {
  it("applies defaults", () => {
    const parsed = statsQuerySchema.parse({});
    expect(parsed.tz).toBe(DEFAULT_TIMEZONE);
    expect(parsed.includeBots).toBe(false);
  });

  it("parses includeBots from query-string booleans", () => {
    expect(statsQuerySchema.parse({ includeBots: "true" }).includeBots).toBe(true);
    expect(statsQuerySchema.parse({ includeBots: "false" }).includeBots).toBe(false);
  });

  it("validates dates and their ordering", () => {
    expect(statsQuerySchema.safeParse({ from: "2026-01-01", to: "2026-01-31" }).success).toBe(true);
    expect(statsQuerySchema.safeParse({ from: "2026-02-01", to: "2026-01-31" }).success).toBe(
      false,
    );
    expect(statsQuerySchema.safeParse({ from: "31/01/2026" }).success).toBe(false);
  });

  it("bounds dates to QUERY_DATE_MIN…QUERY_DATE_MAX", () => {
    expect(statsQuerySchema.safeParse({ from: QUERY_DATE_MIN, to: QUERY_DATE_MAX }).success).toBe(
      true,
    );
    expect(statsQuerySchema.safeParse({ to: "9999-12-31" }).success).toBe(false);
    expect(statsQuerySchema.safeParse({ from: "1999-12-31" }).success).toBe(false);
    expect(exportQuerySchema.safeParse({ to: "9999-12-31" }).success).toBe(false);
  });

  it("validates the timezone", () => {
    expect(statsQuerySchema.safeParse({ tz: "Europe/Paris" }).success).toBe(true);
    expect(statsQuerySchema.safeParse({ tz: "Mars/Olympus" }).success).toBe(false);
  });
});

describe("exportQuerySchema", () => {
  it("defaults includeBots to false and checks date order", () => {
    expect(exportQuerySchema.parse({}).includeBots).toBe(false);
    expect(exportQuerySchema.safeParse({ from: "2026-02-01", to: "2026-01-01" }).success).toBe(
      false,
    );
  });
});

describe("isValidTimezone", () => {
  it("accepts IANA names and UTC, rejects garbage", () => {
    expect(isValidTimezone("Europe/Paris")).toBe(true);
    expect(isValidTimezone("UTC")).toBe(true);
    expect(isValidTimezone("Not/AZone")).toBe(false);
  });
});

describe("response schemas", () => {
  it("validates a link payload", () => {
    const result = linkSchema.safeParse({
      slug: "Ab3xY9z",
      targetUrl: "https://example.com",
      label: null,
      status: "active",
      createdAt: "2026-09-28T10:00:00.000Z",
      updatedAt: "2026-09-28T10:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("validates a create response", () => {
    const result = createLinkResponseSchema.safeParse({
      slug: "Ab3xY9z",
      shortUrl: "https://qr.example.workers.dev/r/Ab3xY9z",
      secretKey: "k".repeat(SECRET_KEY_LENGTH),
    });
    expect(result.success).toBe(true);
  });

  it("validates a full stats response and enforces array lengths", () => {
    const base = {
      range: { from: "2026-09-01", to: "2026-09-28", tz: "Europe/Paris", includeBots: false },
      totals: {
        scans: 12,
        uniqueVisitors: 5,
        firstScanAt: "2026-09-02T08:00:00.000Z",
        lastScanAt: null,
      },
      byDay: [{ date: "2026-09-02", scans: 12, uniqueVisitors: 5 }],
      byHour: [{ hour: "2026-09-02T08:00", scans: 12 }],
      hourOfDay: Array.from({ length: 24 }, () => 0),
      dayOfWeek: Array.from({ length: 7 }, () => 0),
      topCountries: [{ value: "FR", count: 10 }],
      topCities: [{ value: null, country: null, count: 2 }],
      topDevices: [],
      topOs: [],
      topBrowsers: [],
      topLanguages: [],
      topIsps: [],
    };
    expect(statsResponseSchema.safeParse(base).success).toBe(true);
    expect(statsResponseSchema.safeParse({ ...base, hourOfDay: [0, 1, 2] }).success).toBe(false);
    expect(statsResponseSchema.safeParse({ ...base, byHour: null }).success).toBe(true);
  });
});

describe("adminStatusRequestSchema / errors", () => {
  it("parses admin status changes", () => {
    expect(adminStatusRequestSchema.safeParse({ status: "blocked" }).success).toBe(true);
    expect(adminStatusRequestSchema.safeParse({ status: "active" }).success).toBe(true);
    // The admin schema does not accept the owner-only "disabled" value…
    expect(adminStatusRequestSchema.safeParse({ status: "disabled" }).success).toBe(false);
    // …and the owner schema rejects the admin-only "blocked" value.
    expect(updateLinkRequestSchema.safeParse({ status: "blocked" }).success).toBe(false);
    expect(linkSchema.shape.status.safeParse("blocked").success).toBe(true);
    expect(adminStatusRequestSchema.safeParse({}).success).toBe(false);
  });

  it("errorBody round-trips through errorResponseSchema", () => {
    const body = errorBody("NOT_FOUND", "Link not found");
    expect(errorResponseSchema.parse(body)).toEqual({
      error: { code: "NOT_FOUND", message: "Link not found" },
    });
  });
});
