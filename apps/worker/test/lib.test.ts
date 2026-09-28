import { SECRET_KEY_LENGTH, SLUG_LENGTH } from "@qr-tracker/shared";
import { describe, expect, it } from "vitest";

import {
  generateSalt,
  generateSecretKey,
  generateSlug,
  sha256Hex,
  timingSafeEqualHex,
} from "../src/lib/crypto.js";
import { isOverLimit, rateLimitKey, windowStart } from "../src/lib/rate-limit.js";
import { verifyTurnstile } from "../src/lib/turnstile.js";

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
