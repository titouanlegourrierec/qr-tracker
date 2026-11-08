import { SECRET_KEY_LENGTH, SLUG_LENGTH } from "@qr-tracker/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  generateSalt,
  generateSecretKey,
  generateSlug,
  sha256Hex,
  timingSafeEqualHex,
} from "../src/lib/crypto.js";
import { LinkCache } from "../src/lib/link-cache.js";
import {
  isOverLimit,
  parseRateLimitMultiplier,
  rateLimitKey,
  windowStart,
} from "../src/lib/rate-limit.js";
import { verifyTurnstile } from "../src/lib/turnstile.js";
import { checkUrlReputation } from "../src/lib/url-reputation.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("crypto", () => {
  it("generates base62 slugs of the right length", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateSlug()).toMatch(new RegExp(`^[0-9A-Za-z]{${SLUG_LENGTH}}$`));
    }
  });

  it("generates distinct slugs", () => {
    const slugs = new Set(Array.from({ length: 100 }, generateSlug));
    expect(slugs.size).toBe(100);
  });

  it("generates base64url secret keys of the right length", () => {
    for (let i = 0; i < 20; i++) {
      expect(generateSecretKey()).toMatch(new RegExp(`^[A-Za-z0-9_-]{${SECRET_KEY_LENGTH}}$`));
    }
  });

  it("generates non-empty salts", () => {
    expect(generateSalt()).toHaveLength(SECRET_KEY_LENGTH);
  });

  it("computes SHA-256 (known vector)", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("compares hex digests in constant time", async () => {
    const a = await sha256Hex("hello");
    const b = await sha256Hex("hello");
    const c = await sha256Hex("other");
    expect(timingSafeEqualHex(a, b)).toBe(true);
    expect(timingSafeEqualHex(a, c)).toBe(false);
  });

  it("rejects malformed or mismatched-length hex", async () => {
    const a = await sha256Hex("hello");
    expect(timingSafeEqualHex(a, a.slice(0, 32))).toBe(false);
    expect(timingSafeEqualHex("zz", "zz")).toBe(false);
    expect(timingSafeEqualHex("abc", "abc")).toBe(false); // odd length
  });
});

describe("rate-limit window math", () => {
  it("floors to the window start", () => {
    expect(windowStart(61_000, 60)).toBe(60);
    expect(windowStart(119_999, 60)).toBe(60);
    expect(windowStart(120_000, 60)).toBe(120);
    expect(windowStart(3_599_000, 3600)).toBe(0);
  });

  it("builds keys with and without suffix", () => {
    expect(rateLimitKey("createLink", "h")).toBe("createLink:h");
    expect(rateLimitKey("authenticated", "h", "slug1")).toBe("authenticated:h:slug1");
  });

  it("is over limit strictly above the limit", () => {
    expect(isOverLimit(10, 10)).toBe(false);
    expect(isOverLimit(11, 10)).toBe(true);
  });

  it("parses the limit multiplier, falling back to 1", () => {
    expect(parseRateLimitMultiplier("10")).toBe(10);
    expect(parseRateLimitMultiplier("1")).toBe(1);
    for (const raw of [undefined, "", "0", "-3", "1.5", "lots"]) {
      expect(parseRateLimitMultiplier(raw)).toBe(1);
    }
  });
});

describe("verifyTurnstile", () => {
  const okFetch: typeof fetch = () => Promise.resolve(Response.json({ success: true }));
  const koFetch: typeof fetch = () => Promise.resolve(Response.json({ success: false }));

  it("returns true on success", async () => {
    expect(await verifyTurnstile("secret", "token", okFetch)).toBe(true);
  });

  it("posts the secret and token to siteverify", async () => {
    const bodies: URLSearchParams[] = [];
    const spyFetch: typeof fetch = (_url, init) => {
      if (init?.body instanceof URLSearchParams) bodies.push(init.body);
      return Promise.resolve(Response.json({ success: true }));
    };
    await verifyTurnstile("sec", "tok", spyFetch);
    expect(bodies[0]?.get("secret")).toBe("sec");
    expect(bodies[0]?.get("response")).toBe("tok");
  });

  it("returns false on failure, non-200, bad body and network error", async () => {
    expect(await verifyTurnstile("secret", "token", koFetch)).toBe(false);
    const teapot: typeof fetch = () => Promise.resolve(new Response("nope", { status: 500 }));
    expect(await verifyTurnstile("secret", "token", teapot)).toBe(false);
    const weird: typeof fetch = () => Promise.resolve(Response.json({ hello: 1 }));
    expect(await verifyTurnstile("secret", "token", weird)).toBe(false);
    const boom: typeof fetch = () => Promise.reject(new Error("network down"));
    expect(await verifyTurnstile("secret", "token", boom)).toBe(false);
  });
});

describe("checkUrlReputation", () => {
  const enabled = { URL_REPUTATION_ENABLED: "true", SAFE_BROWSING_API_KEY: "test-key" };
  const answering =
    (response: Response): typeof fetch =>
    () =>
      Promise.resolve(response);

  it("skips the lookup when disabled or without an API key", async () => {
    const lookup = vi.fn<typeof fetch>();
    expect(
      await checkUrlReputation("https://example.com", { URL_REPUTATION_ENABLED: "false" }, lookup),
    ).toBe("ok");
    expect(
      await checkUrlReputation("https://example.com", { URL_REPUTATION_ENABLED: "true" }, lookup),
    ).toBe("unknown");
    expect(lookup).not.toHaveBeenCalled();
  });

  it("sends only the destination URL to the Safe Browsing Lookup API", async () => {
    const lookup = vi.fn<typeof fetch>(() => Promise.resolve(Response.json({})));
    expect(await checkUrlReputation("https://example.com/page", enabled, lookup)).toBe("ok");

    const [url, init] = lookup.mock.calls[0] ?? [];
    expect(url).toBe("https://safebrowsing.googleapis.com/v4/threatMatches:find?key=test-key");
    const rawBody = init?.body;
    if (typeof rawBody !== "string") throw new Error("expected a JSON string body");
    const body = JSON.parse(rawBody) as {
      threatInfo: { threatEntries: { url: string }[]; threatTypes: string[] };
    };
    expect(body.threatInfo.threatEntries).toEqual([{ url: "https://example.com/page" }]);
    expect(body.threatInfo.threatTypes).toContain("SOCIAL_ENGINEERING");
  });

  it("flags a destination with a match as malicious", async () => {
    const match = Response.json({
      matches: [{ threatType: "SOCIAL_ENGINEERING", platformType: "ANY_PLATFORM" }],
    });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    expect(await checkUrlReputation("https://phish.example", enabled, answering(match))).toBe(
      "malicious",
    );
  });

  it("fails open (unknown) on API errors, odd bodies and network failures", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failures: (typeof fetch)[] = [
      answering(new Response("quota", { status: 429 })),
      answering(Response.json({ matches: "nope" })),
      () => Promise.reject(new Error("network down")),
    ];
    for (const lookup of failures) {
      expect(await checkUrlReputation("https://example.com", enabled, lookup)).toBe("unknown");
    }
    expect(errorSpy).toHaveBeenCalledTimes(3);
  });
});

describe("LinkCache", () => {
  const link = (slug: string, status: "active" | "disabled" = "active") => ({
    id: 1,
    slug,
    target_url: `https://example.com/${slug}`,
    status,
  });

  it("recalls the last remembered state and forgets on demand", () => {
    const cache = new LinkCache(10, 60_000);
    expect(cache.recall("aaaaaaa")).toBeNull();
    cache.remember(link("aaaaaaa"), 0);
    cache.remember(link("aaaaaaa", "disabled"), 1);
    expect(cache.recall("aaaaaaa", 2)?.status).toBe("disabled");
    cache.forget("aaaaaaa");
    expect(cache.recall("aaaaaaa", 3)).toBeNull();
  });

  it("never keeps more than the secret-free redirect fields", () => {
    const cache = new LinkCache(10, 60_000);
    // A full D1 row carries the secret hash; the cache must drop it.
    const row = { ...link("bbbbbbb"), secret_hash: "f".repeat(64) };
    cache.remember(row, 0);
    expect(Object.keys(cache.recall("bbbbbbb", 0) ?? {}).sort()).toEqual([
      "id",
      "slug",
      "status",
      "target_url",
    ]);
  });

  it("expires entries older than the maximum age", () => {
    const cache = new LinkCache(10, 1_000);
    cache.remember(link("ccccccc"), 0);
    expect(cache.recall("ccccccc", 1_000)).not.toBeNull();
    expect(cache.recall("ccccccc", 1_001)).toBeNull();
    expect(cache.size).toBe(0);
  });

  it("evicts the least recently remembered entry beyond the size bound", () => {
    const cache = new LinkCache(2, 60_000);
    cache.remember(link("one1111"), 0);
    cache.remember(link("two2222"), 1);
    cache.remember(link("one1111"), 2); // refreshed: "two2222" is now the oldest
    cache.remember(link("thr3333"), 3);
    expect(cache.size).toBe(2);
    expect(cache.recall("two2222", 4)).toBeNull();
    expect(cache.recall("one1111", 4)).not.toBeNull();
    expect(cache.recall("thr3333", 4)).not.toBeNull();
  });
});
