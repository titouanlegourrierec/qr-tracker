import { env } from "cloudflare:workers";

import { RATE_LIMITS } from "@qr-tracker/shared";
import type { CreateLinkResponse, Link, LinkSummariesResponse } from "@qr-tracker/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";

const app = createApp();
const BASE = "https://qr-tracker.example.workers.dev";

function stubTurnstile(success: boolean): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(Response.json({ success }))),
  );
}

async function createTestLink(targetUrl = "https://example.com/page"): Promise<CreateLinkResponse> {
  const res = await app.request(
    `${BASE}/api/links`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": crypto.randomUUID() },
      body: JSON.stringify({ targetUrl, label: "Test", turnstileToken: "tok" }),
    },
    env,
  );
  expect(res.status).toBe(201);
  return await res.json<CreateLinkResponse>();
}

beforeEach(() => {
  stubTurnstile(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/links", () => {
  it("creates a link and returns slug, shortUrl and secretKey once", async () => {
    const created = await createTestLink();
    expect(created.slug).toMatch(/^[0-9A-Za-z]{7}$/);
    expect(created.secretKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(created.shortUrl).toBe(`https://qr-tracker.example.workers.dev/r/${created.slug}`);

    const row = await env.DB.prepare("SELECT * FROM links WHERE slug = ?1")
      .bind(created.slug)
      .first<{ target_url: string; label: string; status: string; secret_hash: string }>();
    expect(row?.target_url).toBe("https://example.com/page");
    expect(row?.label).toBe("Test");
    expect(row?.status).toBe("active");
    // Only the hash is stored, never the key.
    expect(row?.secret_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row?.secret_hash).not.toContain(created.secretKey);
  });

  it("rejects invalid bodies with VALIDATION_ERROR", async () => {
    const res = await app.request(
      `${BASE}/api/links`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUrl: "https://example.com" }),
      },
      env,
    );
    expect(res.status).toBe(400);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects non-JSON bodies", async () => {
    const res = await app.request(`${BASE}/api/links`, { method: "POST", body: "not json" }, env);
    expect(res.status).toBe(400);
  });

  it("rejects private-host and worker-host URLs with TARGET_URL_INVALID", async () => {
    for (const targetUrl of [
      "http://localhost:3000",
      "https://qr-tracker.example.workers.dev/r/abc",
      "ftp://example.com",
    ]) {
      const res = await app.request(
        `${BASE}/api/links`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetUrl, turnstileToken: "tok" }),
        },
        env,
      );
      expect(res.status).toBe(400);
      const body = await res.json<{ error: { code: string } }>();
      expect(body.error.code).toBe("TARGET_URL_INVALID");
    }
  });

  it("rejects destinations Safe Browsing flags, on creation and on edit", async () => {
    // Turnstile passes; Safe Browsing flags any URL containing "phish".
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = input instanceof Request ? input.url : input.toString();
        if (!url.startsWith("https://safebrowsing.googleapis.com/")) {
          return Promise.resolve(Response.json({ success: true }));
        }
        const flagged = typeof init?.body === "string" && init.body.includes("phish");
        return Promise.resolve(
          Response.json(flagged ? { matches: [{ threatType: "SOCIAL_ENGINEERING" }] } : {}),
        );
      }),
    );
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const envWithKey = { ...env, SAFE_BROWSING_API_KEY: "test-key" };
    const post = (targetUrl: string) =>
      app.request(
        `${BASE}/api/links`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "CF-Connecting-IP": crypto.randomUUID() },
          body: JSON.stringify({ targetUrl, turnstileToken: "tok" }),
        },
        envWithKey,
      );

    const rejected = await post("https://phish.example/login");
    expect(rejected.status).toBe(400);
    expect((await rejected.json<{ error: { code: string } }>()).error.code).toBe(
      "TARGET_URL_INVALID",
    );

    const created = await post("https://example.com/fine");
    expect(created.status).toBe(201);
    const { slug, secretKey } = await created.json<CreateLinkResponse>();
    const retarget = await app.request(
      `${BASE}/api/links/${slug}`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ targetUrl: "https://phish.example/login" }),
      },
      envWithKey,
    );
    expect(retarget.status).toBe(400);
    const row = await env.DB.prepare("SELECT target_url FROM links WHERE slug = ?1")
      .bind(slug)
      .first<{ target_url: string }>();
    expect(row?.target_url).toBe("https://example.com/fine");
  });

  it("rejects failed Turnstile verification with 403", async () => {
    stubTurnstile(false);
    const res = await app.request(
      `${BASE}/api/links`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUrl: "https://example.com", turnstileToken: "bad" }),
      },
      env,
    );
    expect(res.status).toBe(403);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("TURNSTILE_FAILED");
  });

  it("rate limits creation per IP after the configured limit", async () => {
    const ip = "203.0.113.7";
    const post = () =>
      app.request(
        `${BASE}/api/links`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip },
          body: JSON.stringify({ targetUrl: "https://example.com", turnstileToken: "tok" }),
        },
        env,
      );
    for (let i = 0; i < RATE_LIMITS.createLink.limit; i++) {
      expect((await post()).status).toBe(201);
    }
    const blocked = await post();
    expect(blocked.status).toBe(429);
    const body = await blocked.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("RATE_LIMITED");
  });
});

describe("GET/PATCH/DELETE /api/links/:slug", () => {
  const authHeaders = (key: string, ip = crypto.randomUUID()) => ({
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    "CF-Connecting-IP": ip,
  });

  it("returns link metadata with a valid key", async () => {
    const created = await createTestLink();
    const res = await app.request(
      `${BASE}/api/links/${created.slug}`,
      { headers: authHeaders(created.secretKey) },
      env,
    );
    expect(res.status).toBe(200);
    const link = await res.json<Link>();
    expect(link).toMatchObject({
      slug: created.slug,
      targetUrl: "https://example.com/page",
      label: "Test",
      status: "active",
    });
  });

  it("rejects a wrong key with 401 and a missing header with 401", async () => {
    const created = await createTestLink();
    const wrong = await app.request(
      `${BASE}/api/links/${created.slug}`,
      { headers: authHeaders("k".repeat(43)) },
      env,
    );
    expect(wrong.status).toBe(401);

    const missing = await app.request(`${BASE}/api/links/${created.slug}`, {}, env);
    expect(missing.status).toBe(401);
  });

  it("returns 404 for unknown or malformed slugs", async () => {
    const unknown = await app.request(
      `${BASE}/api/links/zzzzzzz`,
      { headers: authHeaders("k".repeat(43)) },
      env,
    );
    expect(unknown.status).toBe(404);

    const malformed = await app.request(
      `${BASE}/api/links/&bad!`,
      { headers: authHeaders("k".repeat(43)) },
      env,
    );
    expect(malformed.status).toBe(404);
  });

  it("updates the destination and status via PATCH", async () => {
    const created = await createTestLink();
    const res = await app.request(
      `${BASE}/api/links/${created.slug}`,
      {
        method: "PATCH",
        headers: authHeaders(created.secretKey),
        body: JSON.stringify({ targetUrl: "https://updated.example.org", status: "disabled" }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const link = await res.json<Link>();
    // Destinations are stored normalized (URL.href).
    expect(link.targetUrl).toBe("https://updated.example.org/");
    expect(link.status).toBe("disabled");
  });

  it("stores destinations normalized so the redirect never resolves them relatively", async () => {
    // Accepted by the validator (host a.b), but sent verbatim in Location a browser
    // would resolve it against the worker itself: a self-redirect loop.
    const created = await createTestLink("https:/example.com/page");
    const row = await env.DB.prepare("SELECT target_url FROM links WHERE slug = ?1")
      .bind(created.slug)
      .first<{ target_url: string }>();
    expect(row?.target_url).toBe("https://example.com/page");

    const res = await app.request(
      `${BASE}/api/links/${created.slug}`,
      {
        method: "PATCH",
        headers: authHeaders(created.secretKey),
        body: JSON.stringify({ targetUrl: `https:/a.b/../r/${created.slug}` }),
      },
      env,
    );
    expect(res.status).toBe(200);
    expect((await res.json<Link>()).targetUrl).toBe(`https://a.b/r/${created.slug}`);
  });

  it("rejects a PATCH to a private-host URL", async () => {
    const created = await createTestLink();
    const res = await app.request(
      `${BASE}/api/links/${created.slug}`,
      {
        method: "PATCH",
        headers: authHeaders(created.secretKey),
        body: JSON.stringify({ targetUrl: "http://192.168.0.1" }),
      },
      env,
    );
    expect(res.status).toBe(400);
  });

  it("rejects an empty PATCH body", async () => {
    const created = await createTestLink();
    const res = await app.request(
      `${BASE}/api/links/${created.slug}`,
      { method: "PATCH", headers: authHeaders(created.secretKey), body: JSON.stringify({}) },
      env,
    );
    expect(res.status).toBe(400);
  });

  it("deletes the link and its scans permanently", async () => {
    const created = await createTestLink();
    const idRow = await env.DB.prepare("SELECT id FROM links WHERE slug = ?1")
      .bind(created.slug)
      .first<{ id: number }>();
    expect(idRow).not.toBeNull();
    await env.DB.prepare(
      `INSERT INTO scans (link_id, scanned_at, visitor_hash) VALUES (?1, ?2, 'vh')`,
    )
      .bind(idRow?.id, new Date().toISOString())
      .run();

    const res = await app.request(
      `${BASE}/api/links/${created.slug}`,
      { method: "DELETE", headers: authHeaders(created.secretKey) },
      env,
    );
    expect(res.status).toBe(204);

    const linkCount = await env.DB.prepare("SELECT COUNT(*) AS n FROM links WHERE slug = ?1")
      .bind(created.slug)
      .first<{ n: number }>();
    const scanCount = await env.DB.prepare("SELECT COUNT(*) AS n FROM scans WHERE link_id = ?1")
      .bind(idRow?.id)
      .first<{ n: number }>();
    expect(linkCount?.n).toBe(0);
    expect(scanCount?.n).toBe(0);
  });
});

describe("POST /api/links/summaries", () => {
  async function summarize(links: unknown): Promise<Response> {
    return app.request(
      `${BASE}/api/links/summaries`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "CF-Connecting-IP": crypto.randomUUID() },
        body: JSON.stringify({ links }),
      },
      env,
    );
  }

  async function seedScans(slug: string, scans: { at: string; bot?: boolean }[]): Promise<void> {
    for (const scan of scans) {
      await env.DB.prepare(
        `INSERT INTO scans (link_id, scanned_at, is_bot, visitor_hash)
         SELECT id, ?2, ?3, 'vh' FROM links WHERE slug = ?1`,
      )
        .bind(slug, scan.at, scan.bot === true ? 1 : 0)
        .run();
    }
  }

  it("summarizes each code with its own key, in request order", async () => {
    const scanned = await createTestLink();
    const quiet = await createTestLink();
    await seedScans(scanned.slug, [
      { at: "2026-09-10T08:00:00.000Z" },
      { at: "2026-09-12T18:30:00.000Z" },
      // Link previews do not count, here as on the dashboard.
      { at: "2026-09-13T09:00:00.000Z", bot: true },
    ]);
    await env.DB.prepare("UPDATE links SET status = 'disabled' WHERE slug = ?1")
      .bind(quiet.slug)
      .run();

    const res = await summarize([
      { slug: quiet.slug, secretKey: quiet.secretKey },
      { slug: scanned.slug, secretKey: scanned.secretKey },
    ]);
    expect(res.status).toBe(200);
    const body = await res.json<LinkSummariesResponse>();
    expect(body.summaries).toEqual([
      { ok: true, slug: quiet.slug, status: "disabled", scans: 0, lastScanAt: null },
      {
        ok: true,
        slug: scanned.slug,
        status: "active",
        scans: 2,
        lastScanAt: "2026-09-12T18:30:00.000Z",
      },
    ]);
  });

  it("fails only the entries with a wrong key or a deleted link", async () => {
    const mine = await createTestLink();
    const other = await createTestLink();
    const res = await summarize([
      { slug: other.slug, secretKey: mine.secretKey },
      { slug: "Zz9yX8w", secretKey: mine.secretKey },
      { slug: mine.slug, secretKey: mine.secretKey },
    ]);
    const body = await res.json<LinkSummariesResponse>();
    expect(body.summaries).toEqual([
      { ok: false, slug: other.slug, error: "UNAUTHORIZED" },
      { ok: false, slug: "Zz9yX8w", error: "NOT_FOUND" },
      { ok: true, slug: mine.slug, status: "active", scans: 0, lastScanAt: null },
    ]);
  });

  it("rejects empty, oversized or malformed lists", async () => {
    expect((await summarize([])).status).toBe(400);
    expect((await summarize([{ slug: "bad", secretKey: "x" }])).status).toBe(400);
    const created = await createTestLink();
    const tooMany = Array.from({ length: 51 }, () => ({
      slug: created.slug,
      secretKey: created.secretKey,
    }));
    expect((await summarize(tooMany)).status).toBe(400);
  });
});
