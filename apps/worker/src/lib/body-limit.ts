import {
  adminStatusRequestSchema,
  MAX_LABEL_LENGTH,
  MAX_REPORT_DETAILS_LENGTH,
  MAX_TARGET_URL_LENGTH,
  MAX_TURNSTILE_TOKEN_LENGTH,
  ownerLinkStatusSchema,
  reportReasonSchema,
  SECRET_KEY_LENGTH,
  SLUG_LENGTH,
  SUMMARY_MAX_LINKS,
} from "@qr-tracker/shared";

/**
 * UTF-8 bytes JSON.stringify spends on one UTF-16 code unit (what Zod's `.max()` counts) of
 * ordinary text: at most 3, for a character such as "€" or "日" (an emoji takes 4 bytes for
 * 2 units). Control characters and lone surrogates become 6-byte `\uXXXX` escapes, but no
 * legitimate URL, label, token or report holds them.
 */
export const MAX_UTF8_BYTES_PER_CHAR = 3;

/** Size of a JSON string literal holding up to `maxChars` characters, quotes included. */
export function jsonStringMaxBytes(
  maxChars: number,
  bytesPerChar: number = MAX_UTF8_BYTES_PER_CHAR,
): number {
  return maxChars * bytesPerChar + 2;
}

/** Size of a JSON object given the largest encoded value of each of its members. */
export function jsonObjectMaxBytes(members: Readonly<Record<string, number>>): number {
  const entries = Object.entries(members);
  // Braces, `"name":` before each value, and the commas between members.
  const memberBytes = entries.reduce(
    (sum, [name, valueBytes]) => sum + name.length + 3 + valueBytes,
    0,
  );
  return memberBytes + 2 + Math.max(entries.length - 1, 0);
}

/** Size of a JSON array of up to `count` items of up to `itemBytes` each. */
export function jsonArrayMaxBytes(count: number, itemBytes: number): number {
  return count * itemBytes + 2 + Math.max(count - 1, 0);
}

/** Smallest power of two that is at least `n`. */
export function nextPowerOfTwo(n: number): number {
  return n <= 1 ? 1 : 2 ** Math.ceil(Math.log2(n));
}

/** Slugs, keys and enum members are ASCII by their schema: one byte per character. */
const asciiString = (maxChars: number): number => jsonStringMaxBytes(maxChars, 1);
const longest = (values: readonly string[]): number => Math.max(...values.map((v) => v.length));

/**
 * Largest compact JSON body of each request the API reads, every field at its schema
 * maximum. test/body-limit-lib.test.ts measures schema-valid worst-case bodies against these
 * and fails when a request schema gains a field that is not listed here.
 */
export const MAX_BODY_BYTES_BY_REQUEST = {
  createLink: jsonObjectMaxBytes({
    targetUrl: jsonStringMaxBytes(MAX_TARGET_URL_LENGTH),
    label: jsonStringMaxBytes(MAX_LABEL_LENGTH),
    turnstileToken: jsonStringMaxBytes(MAX_TURNSTILE_TOKEN_LENGTH),
  }),
  updateLink: jsonObjectMaxBytes({
    targetUrl: jsonStringMaxBytes(MAX_TARGET_URL_LENGTH),
    status: asciiString(longest(ownerLinkStatusSchema.options)),
  }),
  linkSummaries: jsonObjectMaxBytes({
    links: jsonArrayMaxBytes(
      SUMMARY_MAX_LINKS,
      jsonObjectMaxBytes({
        slug: asciiString(SLUG_LENGTH),
        secretKey: asciiString(SECRET_KEY_LENGTH),
      }),
    ),
  }),
  createReport: jsonObjectMaxBytes({
    slug: asciiString(SLUG_LENGTH),
    reason: asciiString(longest(reportReasonSchema.options)),
    details: jsonStringMaxBytes(MAX_REPORT_DETAILS_LENGTH),
    turnstileToken: jsonStringMaxBytes(MAX_TURNSTILE_TOKEN_LENGTH),
  }),
  adminStatus: jsonObjectMaxBytes({
    status: asciiString(longest(adminStatusRequestSchema.shape.status.options)),
  }),
} as const;

/**
 * Cap on every API request body, in bytes: the largest request above (a new link, ≈ 18.8 KB)
 * rounded up to a power of two, i.e. 32 KiB. The headroom covers pretty-printed JSON and
 * clients that escape more than JSON.stringify does. A schema-valid body has no true upper
 * bound (`.trim()` runs before `.max()`, JSON allows any whitespace, unknown keys are
 * stripped), so padded bodies Zod would accept are refused on purpose.
 */
export const MAX_REQUEST_BODY_BYTES = nextPowerOfTwo(
  Math.max(...Object.values(MAX_BODY_BYTES_BY_REQUEST)),
);
