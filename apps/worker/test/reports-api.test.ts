import { env } from "cloudflare:workers";

import { RATE_LIMITS } from "@qr-tracker/shared";
import type { CreateLinkResponse } from "@qr-tracker/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";

const app = createApp();
const BASE = "https://qr-tracker.example.workers.dev";
const ADMIN = { Authorization: "Bearer test-admin-token" };

interface AdminReport {
  id: number;
  slug: string;
  targetUrl: string;
  linkStatus: string;
  reason: string;
  details: string | null;
  createdAt: string;
}

function stubTurnstile(success: boolean): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(Response.json({ success }))),
  );
}

async function createTestLink(): Promise<CreateLinkResponse> {
  const res = await app.request(
    `${BASE}/api/links`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": crypto.randomUUID() },
      body: JSON.stringify({ targetUrl: "https://example.com/promo", turnstileToken: "tok" }),
    },
    env,
  );
  expect(res.status).toBe(201);
  return await res.json<CreateLinkResponse>();
}

function postReport(body: Record<string, unknown>, ip: string = crypto.randomUUID()) {
  return app.request(
    `${BASE}/api/reports`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip },
      body: JSON.stringify({ turnstileToken: "tok", ...body }),
    },
    env,
  );
}

async function adminReports(): Promise<AdminReport[]> {
  const res = await app.request(`${BASE}/api/admin/reports`, { headers: ADMIN }, env);
  expect(res.status).toBe(200);
  return (await res.json<{ reports: AdminReport[] }>()).reports;
}

beforeEach(() => {
  stubTurnstile(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/reports", () => {
  it("stores a report the operator can list, without the reporter's identity", async () => {
    const { slug } = await createTestLink();
    const res = await postReport(
      { slug, reason: "phishing", details: "  Asks for my bank password  " },
      "198.51.100.23",
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ received: true });

    const report = (await adminReports()).find((r) => r.slug === slug);
    expect(report).toMatchObject({
      slug,
      targetUrl: "https://example.com/promo",
      linkStatus: "active",
      reason: "phishing",
      details: "Asks for my bank password",
    });
    const rows = await env.DB.prepare("SELECT * FROM abuse_reports").all();
    expect(JSON.stringify(rows.results)).not.toContain("198.51.100.23");
  });

  it("stores empty details as null", async () => {
    const { slug } = await createTestLink();
    expect((await postReport({ slug, reason: "spam", details: "   " })).status).toBe(201);
    const report = (await adminReports()).find((r) => r.slug === slug);
    expect(report?.details).toBeNull();
  });

  it("answers 404 for an unknown code and 400 for an invalid body", async () => {
    const unknown = await postReport({ slug: "zzzzzzz", reason: "spam" });
    expect(unknown.status).toBe(404);

    for (const body of [
      { slug: "short", reason: "spam" },
      { slug: "zzzzzzz", reason: "boring" },
      { slug: "zzzzzzz", reason: "other", details: "x".repeat(1001) },
    ]) {
      const res = await postReport(body);
      expect(res.status).toBe(400);
      expect((await res.json<{ error: { code: string } }>()).error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("requires a valid Turnstile token", async () => {
    const { slug } = await createTestLink();
    stubTurnstile(false);
    const res = await postReport({ slug, reason: "malware" });
    expect(res.status).toBe(403);
    expect((await res.json<{ error: { code: string } }>()).error.code).toBe("TURNSTILE_FAILED");
  });

  it("rate limits reports per IP", async () => {
    const { slug } = await createTestLink();
    const ip = "203.0.113.99";
    for (let i = 0; i < RATE_LIMITS.report.limit; i++) {
      expect((await postReport({ slug, reason: "spam" }, ip)).status).toBe(201);
    }
    expect((await postReport({ slug, reason: "spam" }, ip)).status).toBe(429);
  });
});

describe("admin report queue", () => {
  it("requires the admin token", async () => {
    const list = await app.request(`${BASE}/api/admin/reports`, {}, env);
    expect(list.status).toBe(401);
    const dismiss = await app.request(
      `${BASE}/api/admin/links/zzzzzzz/reports`,
      { method: "DELETE", headers: { Authorization: "Bearer nope" } },
      env,
    );
    expect(dismiss.status).toBe(401);
  });

  it("validates the limit and lists newest first", async () => {
    const bad = await app.request(`${BASE}/api/admin/reports?limit=0`, { headers: ADMIN }, env);
    expect(bad.status).toBe(400);

    const { slug } = await createTestLink();
    await postReport({ slug, reason: "spam" });
    await postReport({ slug, reason: "illegal" });
    const res = await app.request(`${BASE}/api/admin/reports?limit=1`, { headers: ADMIN }, env);
    const { reports } = await res.json<{ reports: AdminReport[] }>();
    expect(reports).toHaveLength(1);
    expect(reports[0]?.reason).toBe("illegal");
  });

  it("dismisses a link's reports, and 404s for unknown links", async () => {
    const { slug } = await createTestLink();
    await postReport({ slug, reason: "phishing" });
    await postReport({ slug, reason: "malware" });

    const res = await app.request(
      `${BASE}/api/admin/links/${slug}/reports`,
      { method: "DELETE", headers: ADMIN },
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ dismissed: 2 });
    expect((await adminReports()).some((r) => r.slug === slug)).toBe(false);

    const unknown = await app.request(
      `${BASE}/api/admin/links/zzzzzzz/reports`,
      { method: "DELETE", headers: ADMIN },
      env,
    );
    expect(unknown.status).toBe(404);
  });

  it("deletes a link's reports with the link", async () => {
    const { slug, secretKey } = await createTestLink();
    await postReport({ slug, reason: "spam" });
    const res = await app.request(
      `${BASE}/api/links/${slug}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${secretKey}` } },
      env,
    );
    expect(res.status).toBe(204);
    expect((await adminReports()).some((r) => r.slug === slug)).toBe(false);
  });
});

describe("worker root", () => {
  it("redirects / and /report to the web app", async () => {
    const root = await app.request(`${BASE}/`, {}, env);
    expect(root.status).toBe(302);
    expect(root.headers.get("Location")).toBe(env.WEB_APP_URL);

    const report = await app.request(`${BASE}/report`, {}, env);
    expect(report.status).toBe(302);
    expect(report.headers.get("Location")).toBe(`${env.WEB_APP_URL}#/report`);
  });
});
