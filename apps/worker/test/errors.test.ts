import { env } from "cloudflare:workers";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { ApiError } from "../src/lib/api-error.js";
import { log, logError } from "../src/lib/log.js";

describe("error handling", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps ApiError to the canonical body and status", async () => {
    const app = createApp();
    app.get("/boom", () => {
      throw new ApiError("RATE_LIMITED", "Too many requests");
    });
    const res = await app.request("/boom", {}, env);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: { code: "RATE_LIMITED", message: "Too many requests" },
    });
  });

  it("maps unexpected errors to 500 INTERNAL and logs them", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const app = createApp();
    app.get("/crash", () => {
      throw new Error("kaboom");
    });
    const res = await app.request("/crash", {}, env);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: { code: "INTERNAL", message: "Internal server error" },
    });
    expect(spy).toHaveBeenCalledOnce();
    const line = spy.mock.calls[0]?.[0] as string;
    expect(JSON.parse(line)).toMatchObject({ event: "unhandled_error", error: "kaboom" });
  });

  it("adds a CSP header on HTML responses", async () => {
    const app = createApp();
    app.get("/page", (c) => c.html("<p>bonjour</p>"));
    const res = await app.request("/page", {}, env);
    expect(res.headers.get("Content-Security-Policy")).toContain("default-src 'none'");
  });

  it("assigns each error code its HTTP status", () => {
    expect(new ApiError("VALIDATION_ERROR", "x").status).toBe(400);
    expect(new ApiError("TARGET_URL_INVALID", "x").status).toBe(400);
    expect(new ApiError("TURNSTILE_FAILED", "x").status).toBe(403);
    expect(new ApiError("UNAUTHORIZED", "x").status).toBe(401);
    expect(new ApiError("NOT_FOUND", "x").status).toBe(404);
    expect(new ApiError("INTERNAL", "x").status).toBe(500);
  });
});

describe("structured logging", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("log() emits one JSON line with time and event", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    log("scan_recorded", { slug: "abc" });
    const parsed = JSON.parse(spy.mock.calls[0]?.[0] as string) as Record<string, unknown>;
    expect(parsed.event).toBe("scan_recorded");
    expect(parsed.slug).toBe("abc");
    expect(typeof parsed.time).toBe("string");
  });

  it("logError() serializes non-Error values", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logError("weird", "just a string");
    const parsed = JSON.parse(spy.mock.calls[0]?.[0] as string) as Record<string, unknown>;
    expect(parsed.error).toBe("just a string");
  });
});
