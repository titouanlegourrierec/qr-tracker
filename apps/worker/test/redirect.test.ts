import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { sha256Hex } from "../src/lib/crypto.js";
import { scanContextFromRequest } from "../src/routes/redirect.js";

import { HUMAN_UAS, PREVIEWER_UAS } from "./fixtures/user-agents.js";

const app = createApp();
const BASE = "https://qr-tracker.example.workers.dev";

interface ScanRow {
  country: string | null;
  city: string | null;
  device_type: string;
  os: string | null;
  browser: string | null;
  language: string | null;
  is_bot: number;
  visitor_hash: string;
}

async function insertTestLink(
  slug: string,
  status = "active",
  targetUrl = "https://example.com/dest",
): Promise<number> {
  const now = new Date().toISOString();
  const row = await env.DB.prepare(
    `INSERT INTO links (slug, target_url, label, secret_hash, status, created_at, updated_at)
     VALUES (?1, ?5, NULL, ?2, ?3, ?4, ?4) RETURNING id`,
  )
    .bind(slug, await sha256Hex("k".repeat(43)), status, now, targetUrl)
    .first<{ id: number }>();
  if (row === null) throw new Error("insert failed");
  return row.id;
}

async function scanOnce(slug: string, headers: Record<string, string>): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await app.request(`${BASE}/r/${slug}`, { headers }, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /r/:slug", () => {
  it("302-redirects with Cache-Control: no-store and records the scan", async () => {
    const id = await insertTestLink("redir01");
    const res = await scanOnce("redir01", {
      "User-Agent": HUMAN_UAS.iphoneSafari ?? "",
      "Accept-Language": "fr-FR,fr;q=0.9",
      "CF-Connecting-IP": "198.51.100.10",
    });

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://example.com/dest");
    expect(res.headers.get("Cache-Control")).toBe("no-store");

    const scan = await env.DB.prepare("SELECT * FROM scans WHERE link_id = ?1")
      .bind(id)
      .first<ScanRow>();
    expect(scan).not.toBeNull();
    expect(scan?.device_type).toBe("mobile");
    expect(scan?.os).toBe("iOS");
    expect(scan?.language).toBe("fr");
    expect(scan?.is_bot).toBe(0);
    expect(scan?.visitor_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("never stores the raw IP or full user-agent", async () => {
    const id = await insertTestLink("privacy1");
    const ua = HUMAN_UAS.windowsChrome ?? "";
    await scanOnce("privacy1", { "User-Agent": ua, "CF-Connecting-IP": "198.51.100.77" });

    const rows = await env.DB.prepare("SELECT * FROM scans WHERE link_id = ?1").bind(id).all();
    const serialized = JSON.stringify(rows.results);
    expect(serialized).not.toContain("198.51.100.77");
    expect(serialized).not.toContain(ua);
  });

  it("never reads or stores the visitor's network operator", async () => {
    const request = new Request(`${BASE}/r/isp0001`, {
      cf: { country: "FR", city: "Lyon", asOrganization: "Orange S.A." },
    });
    const context = scanContextFromRequest(request);
    expect(context.country).toBe("FR");
    expect(JSON.stringify(context)).not.toContain("Orange");

    const columns = await env.DB.prepare("SELECT name FROM pragma_table_info('scans')").all<{
      name: string;
    }>();
    expect(columns.results.map((c) => c.name)).not.toContain("as_organization");
  });

  it("uses a stable visitor hash for the same visitor on the same day", async () => {
    const id = await insertTestLink("uniq001");
    const headers = {
      "User-Agent": HUMAN_UAS.macSafari ?? "",
      "CF-Connecting-IP": "203.0.113.5",
    };
    await scanOnce("uniq001", headers);
    await scanOnce("uniq001", headers);
    await scanOnce("uniq001", { ...headers, "CF-Connecting-IP": "203.0.113.6" });

    const rows = await env.DB.prepare(
      "SELECT COUNT(DISTINCT visitor_hash) AS unique_visitors, COUNT(*) AS scans FROM scans WHERE link_id = ?1",
    )
      .bind(id)
      .first<{ unique_visitors: number; scans: number }>();
    expect(rows?.scans).toBe(3);
    expect(rows?.unique_visitors).toBe(2);
  });

  it("flags previewer scans as bots but still redirects them", async () => {
    const id = await insertTestLink("botlink");
    const res = await scanOnce("botlink", { "User-Agent": PREVIEWER_UAS.whatsapp ?? "" });
    expect(res.status).toBe(302);

    const scan = await env.DB.prepare("SELECT is_bot FROM scans WHERE link_id = ?1")
      .bind(id)
      .first<{ is_bot: number }>();
    expect(scan?.is_bot).toBe(1);
  });

  it("answers HEAD requests with the redirect but does not count them as scans", async () => {
    const id = await insertTestLink("headlnk");
    const ctx = createExecutionContext();
    const res = await app.request(
      `${BASE}/r/headlnk`,
      { method: "HEAD", headers: { "User-Agent": HUMAN_UAS.macSafari ?? "" } },
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://example.com/dest");

    // Link checkers send HEAD, even with browser-like user agents.
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM scans WHERE link_id = ?1")
      .bind(id)
      .first<{ n: number }>();
    expect(count?.n).toBe(0);
  });

  it("serves a friendly 404 page for unknown slugs", async () => {
    const res = await scanOnce("zzzzzzz", {});
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const html = await res.text();
    expect(html).toContain('lang="en"');
    expect(html).toContain("does not exist");
  });

  it("serves a friendly 410 page for disabled links without recording scans", async () => {
    const id = await insertTestLink("offlink", "disabled");
    const res = await scanOnce("offlink", { "User-Agent": HUMAN_UAS.macSafari ?? "" });
    expect(res.status).toBe(410);
    // Chromium caches a header-less 410 forever, which would outlive a re-enable.
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.text()).toContain("disabled");

    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM scans WHERE link_id = ?1")
      .bind(id)
      .first<{ n: number }>();
    expect(count?.n).toBe(0);
  });

  it("still redirects when scan recording fails", async () => {
    await insertTestLink("failtrk");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    // Sabotage tracking for this test file's isolated database.
    await env.DB.prepare("ALTER TABLE scans RENAME TO scans_backup").run();
    try {
      const res = await scanOnce("failtrk", { "User-Agent": HUMAN_UAS.macSafari ?? "" });
      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe("https://example.com/dest");
      expect(errorSpy).toHaveBeenCalled();
      const line = errorSpy.mock.calls.at(-1)?.[0] as string;
      expect(line).toContain("scan_record_failed");
    } finally {
      await env.DB.prepare("ALTER TABLE scans_backup RENAME TO scans").run();
    }
  });

  it("sends an absolute Location even for destinations stored raw by older versions", async () => {
    await insertTestLink("legacy1", "active", "https:/example.com/old");
    const res = await scanOnce("legacy1", {});
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://example.com/old");
  });

  it("falls back to the last known state when D1 fails, else serves a 503 page", async () => {
    await insertTestLink("cachelk");
    expect((await scanOnce("cachelk", {})).status).toBe(302); // this isolate now knows it

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(env.DB, "prepare").mockImplementation(() => {
      throw new Error("D1 daily limit exceeded");
    });

    const cached = await scanOnce("cachelk", {});
    expect(cached.status).toBe(302);
    expect(cached.headers.get("Location")).toBe("https://example.com/dest");

    const unknown = await scanOnce("unseen1", {});
    expect(unknown.status).toBe(503);
    expect(unknown.headers.get("Cache-Control")).toBe("no-store");
    expect(await unknown.text()).toContain("temporarily unavailable");

    const lines = errorSpy.mock.calls.map((call) => String(call[0]));
    expect(lines.filter((line) => line.includes("link_lookup_failed"))).toHaveLength(2);
  });
});
