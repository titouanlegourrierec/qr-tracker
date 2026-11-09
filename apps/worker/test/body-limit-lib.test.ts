import {
  adminStatusRequestSchema,
  createLinkRequestSchema,
  createReportRequestSchema,
  linkSummariesRequestSchema,
  MAX_LABEL_LENGTH,
  MAX_REPORT_DETAILS_LENGTH,
  MAX_TARGET_URL_LENGTH,
  MAX_TURNSTILE_TOKEN_LENGTH,
  ownerLinkStatusSchema,
  reportReasonSchema,
  SECRET_KEY_LENGTH,
  SLUG_LENGTH,
  SUMMARY_MAX_LINKS,
  updateLinkRequestSchema,
} from "@qr-tracker/shared";
import { describe, expect, it } from "vitest";
import type { z } from "zod";

import {
  jsonArrayMaxBytes,
  jsonObjectMaxBytes,
  jsonStringMaxBytes,
  MAX_BODY_BYTES_BY_REQUEST,
  MAX_REQUEST_BODY_BYTES,
  MAX_UTF8_BYTES_PER_CHAR,
  nextPowerOfTwo,
} from "../src/lib/body-limit.js";

const utf8Bytes = (text: string): number => new TextEncoder().encode(text).byteLength;
const jsonBytes = (value: unknown): number => utf8Bytes(JSON.stringify(value));

/** "€" takes 3 bytes of UTF-8 for one UTF-16 code unit: the widest ordinary character. */
const wide = (length: number): string => "€".repeat(length);
const longestOf = (values: readonly string[]): string =>
  values.reduce((a, b) => (b.length > a.length ? b : a));

type RequestName = keyof typeof MAX_BODY_BYTES_BY_REQUEST;

interface WorstCase {
  name: RequestName;
  schema: z.ZodType;
  shape: Readonly<Record<string, unknown>>;
  body: Record<string, unknown>;
}

const summaryItemSchema = linkSummariesRequestSchema.shape.links.element;

/** The largest body of each request: every field present and at its schema maximum. */
const worstCases: WorstCase[] = [
  {
    name: "createLink",
    schema: createLinkRequestSchema,
    shape: createLinkRequestSchema.shape,
    body: {
      targetUrl: wide(MAX_TARGET_URL_LENGTH),
      label: wide(MAX_LABEL_LENGTH),
      turnstileToken: wide(MAX_TURNSTILE_TOKEN_LENGTH),
    },
  },
  {
    name: "updateLink",
    schema: updateLinkRequestSchema,
    shape: updateLinkRequestSchema.shape,
    body: {
      targetUrl: wide(MAX_TARGET_URL_LENGTH),
      status: longestOf(ownerLinkStatusSchema.options),
    },
  },
  {
    name: "linkSummaries",
    schema: linkSummariesRequestSchema,
    shape: linkSummariesRequestSchema.shape,
    body: {
      links: Array.from({ length: SUMMARY_MAX_LINKS }, () => ({
        slug: "A".repeat(SLUG_LENGTH),
        secretKey: "A".repeat(SECRET_KEY_LENGTH),
      })),
    },
  },
  {
    name: "createReport",
    schema: createReportRequestSchema,
    shape: createReportRequestSchema.shape,
    body: {
      slug: "A".repeat(SLUG_LENGTH),
      reason: longestOf(reportReasonSchema.options),
      details: wide(MAX_REPORT_DETAILS_LENGTH),
      turnstileToken: wide(MAX_TURNSTILE_TOKEN_LENGTH),
    },
  },
  {
    name: "adminStatus",
    schema: adminStatusRequestSchema,
    shape: adminStatusRequestSchema.shape,
    body: { status: longestOf(adminStatusRequestSchema.shape.status.options) },
  },
];

describe("JSON size bounds", () => {
  it("measures string literals with their quotes", () => {
    expect(jsonStringMaxBytes(0)).toBe(jsonBytes(""));
    expect(jsonStringMaxBytes(4)).toBe(jsonBytes(wide(4)));
    expect(jsonStringMaxBytes(4, 1)).toBe(jsonBytes("abcd"));
  });

  it("measures objects with their member names, braces and commas", () => {
    expect(jsonObjectMaxBytes({})).toBe(jsonBytes({}));
    expect(jsonObjectMaxBytes({ a: jsonStringMaxBytes(2, 1) })).toBe(jsonBytes({ a: "xy" }));
    expect(jsonObjectMaxBytes({ a: 1, bc: 3 })).toBe(jsonBytes({ a: 1, bc: 123 }));
  });

  it("measures arrays with their brackets and commas", () => {
    expect(jsonArrayMaxBytes(0, 10)).toBe(jsonBytes([]));
    expect(jsonArrayMaxBytes(3, 1)).toBe(jsonBytes([1, 2, 3]));
  });

  it("never spends more than 3 bytes per UTF-16 code unit on ordinary text", () => {
    for (const text of ["a", "é", "€", "日本", "😀", "line\nbreak", 'quote"'])
      expect(jsonBytes(text) - 2).toBeLessThanOrEqual(text.length * MAX_UTF8_BYTES_PER_CHAR);
  });

  it("rounds up to the next power of two", () => {
    expect([0, 1, 2, 3, 4, 5, 1024, 1025].map(nextPowerOfTwo)).toEqual([
      1, 1, 2, 4, 4, 8, 1024, 2048,
    ]);
  });
});

describe("request body cap", () => {
  it("has a worst case for every request it bounds", () => {
    expect(worstCases.map((c) => c.name).sort()).toEqual(
      Object.keys(MAX_BODY_BYTES_BY_REQUEST).sort(),
    );
  });

  it.each(worstCases)("$name: bound equals its schema-valid worst case", (worstCase) => {
    // A field added to the schema but missing from MAX_BODY_BYTES_BY_REQUEST fails here.
    expect(Object.keys(worstCase.body).sort()).toEqual(Object.keys(worstCase.shape).sort());
    expect(worstCase.schema.safeParse(worstCase.body).success).toBe(true);
    expect(jsonBytes(worstCase.body)).toBe(MAX_BODY_BYTES_BY_REQUEST[worstCase.name]);
  });

  it("bounds every summary item field", () => {
    expect(Object.keys(summaryItemSchema.shape).sort()).toEqual(["secretKey", "slug"]);
  });

  it("is the next power of two above the largest request (32 KiB, as documented)", () => {
    const largest = Math.max(...Object.values(MAX_BODY_BYTES_BY_REQUEST));
    expect(largest).toBe(MAX_BODY_BYTES_BY_REQUEST.createLink);
    expect(MAX_REQUEST_BODY_BYTES).toBeGreaterThanOrEqual(largest);
    expect(MAX_REQUEST_BODY_BYTES).toBeLessThan(2 * largest);
    expect(MAX_REQUEST_BODY_BYTES).toBe(32 * 1024);
  });
});
