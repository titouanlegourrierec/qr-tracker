import { env } from "cloudflare:workers";

import { RATE_LIMITS } from "@qr-tracker/shared";
import type { CreateLinkResponse, Link } from "@qr-tracker/shared";
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
    expect(link.targetUrl).toBe("https://updated.example.org");
    expect(link.status).toBe("disabled");
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
