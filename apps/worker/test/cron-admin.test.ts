import {
  createExecutionContext,
  createScheduledController,
  waitOnExecutionContext,
} from "cloudflare:test";
import { env } from "cloudflare:workers";

import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import worker from "../src/index.js";
import { sha256Hex } from "../src/lib/crypto.js";
import { parseRetentionDays, runDailyMaintenance } from "../src/services/cron.js";

const app = createApp();
const BASE = "https://qr-tracker.example.workers.dev";

function stubTurnstile(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(Response.json({ success: true }))),
  );
}

async function insertLink(slug: string): Promise<number> {
  const now = new Date().toISOString();
  const row = await env.DB.prepare(
    `INSERT INTO links (slug, target_url, label, secret_hash, status, created_at, updated_at)
     VALUES (?1, 'https://example.com', NULL, ?2, 'active', ?3, ?3) RETURNING id`,
  )
    .bind(slug, await sha256Hex("k".repeat(43)), now)
    .first<{ id: number }>();
  if (row === null) throw new Error("insert failed");
  return row.id;
}

describe("parseRetentionDays", () => {
  it("parses valid values and falls back on garbage", () => {
    expect(parseRetentionDays("30")).toBe(30);
    expect(parseRetentionDays("365")).toBe(365);
    expect(parseRetentionDays("banana")).toBe(365);
    expect(parseRetentionDays("-5")).toBe(365);
    expect(parseRetentionDays("0")).toBe(365);
    expect(parseRetentionDays(undefined)).toBe(365);
  });
});

describe("runDailyMaintenance", () => {
  it("rotates salts, purges old scans and cleans rate-limit windows", async () => {
    const now = new Date("2026-09-28T03:10:00Z");
    const linkId = await insertLink("cronlnk");

    // Salts: ancient (delete), yesterday (keep), plus today created by the run.
    await env.DB.prepare("INSERT INTO salts (day, salt) VALUES ('2026-09-01', 'old-salt')").run();
    await env.DB.prepare("INSERT INTO salts (day, salt) VALUES ('2026-09-27', 'y-salt')").run();

    // Scans: one past retention (365d), one recent.
    await env.DB.prepare(
      `INSERT INTO scans (link_id, scanned_at, visitor_hash) VALUES
       (?1, '2025-09-01T00:00:00.000Z', 'old'), (?1, '2026-09-27T00:00:00.000Z', 'new')`,
    )
      .bind(linkId)
      .run();

    // Rate-limit windows: expired vs current.
    const nowSec = Math.floor(now.getTime() / 1000);
    await env.DB.prepare(
      `INSERT INTO rate_limits (key, window_start, count) VALUES
       ('old:w', ?1, 3), ('new:w', ?2, 1)`,
    )
      .bind(nowSec - 172_800, nowSec - 60)
      .run();

    const report = await runDailyMaintenance(env, now);
    expect(report.saltsDeleted).toBe(1);
    expect(report.scansPurged).toBe(1);
    expect(report.rateWindowsDeleted).toBe(1);

    const salts = await env.DB.prepare("SELECT day FROM salts ORDER BY day").all<{ day: string }>();
    expect(salts.results.map((r) => r.day)).toEqual(["2026-09-27", "2026-09-28"]);

    const scans = await env.DB.prepare("SELECT visitor_hash FROM scans WHERE link_id = ?1")
      .bind(linkId)
      .all<{ visitor_hash: string }>();
    expect(scans.results.map((r) => r.visitor_hash)).toEqual(["new"]);

    const windows = await env.DB.prepare("SELECT key FROM rate_limits").all<{ key: string }>();
    expect(windows.results.map((r) => r.key)).toEqual(["new:w"]);
  });

  it("runs via the scheduled handler", async () => {
    const controller = createScheduledController({
      scheduledTime: new Date(),
      cron: "10 3 * * *",
    });
    const ctx = createExecutionContext();
    worker.scheduled(controller, env, ctx);
    await waitOnExecutionContext(ctx);
    const today = new Date().toISOString().slice(0, 10);
    const salt = await env.DB.prepare("SELECT salt FROM salts WHERE day = ?1")
      .bind(today)
      .first<{ salt: string }>();
    expect(salt).not.toBeNull();
  });
});

describe("POST /api/admin/links/:slug/status", () => {
  const headers = (token: string) => ({
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  });

  it("blocks and re-enables a slug with the admin token", async () => {
    await insertLink("admlnk1");
    const block = await app.request(
      `${BASE}/api/admin/links/admlnk1/status`,
      {
        method: "POST",
        headers: headers("test-admin-token"),
        body: JSON.stringify({ status: "blocked" }),
      },
      env,
    );
    expect(block.status).toBe(200);

    // The redirect now serves the French 410 page.
    const redirect = await app.request(`${BASE}/r/admlnk1`, {}, env, createExecutionContext());
    expect(redirect.status).toBe(410);

    const enable = await app.request(
      `${BASE}/api/admin/links/admlnk1/status`,
      {
        method: "POST",
        headers: headers("test-admin-token"),
        body: JSON.stringify({ status: "active" }),
      },
      env,
    );
    expect(enable.status).toBe(200);
    const body = await enable.json<{ status: string }>();
    expect(body.status).toBe("active");
  });

  it("rejects wrong tokens, bad bodies and unknown slugs", async () => {
    await insertLink("admlnk2");
    const wrongToken = await app.request(
      `${BASE}/api/admin/links/admlnk2/status`,
      { method: "POST", headers: headers("nope"), body: JSON.stringify({ status: "blocked" }) },
      env,
    );
    expect(wrongToken.status).toBe(401);

    const badBody = await app.request(
      `${BASE}/api/admin/links/admlnk2/status`,
      {
        method: "POST",
        headers: headers("test-admin-token"),
        body: JSON.stringify({ status: "nope" }),
      },
      env,
    );
    expect(badBody.status).toBe(400);

    const unknown = await app.request(
      `${BASE}/api/admin/links/zzzzzzz/status`,
      {
        method: "POST",
        headers: headers("test-admin-token"),
        body: JSON.stringify({ status: "blocked" }),
      },
      env,
    );
    expect(unknown.status).toBe(404);
  });

  it("prevents the owner from lifting an admin block", async () => {
    stubTurnstile();
    const created = await app.request(
      `${BASE}/api/links`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "CF-Connecting-IP": crypto.randomUUID() },
        body: JSON.stringify({ targetUrl: "https://example.com/abuse", turnstileToken: "tok" }),
      },
      env,
    );
    const { slug, secretKey } = await created.json<{ slug: string; secretKey: string }>();

    const block = await app.request(
      `${BASE}/api/admin/links/${slug}/status`,
      {
        method: "POST",
        headers: headers("test-admin-token"),
        body: JSON.stringify({ status: "blocked" }),
      },
      env,
    );
    expect(block.status).toBe(200);

    // Owner cannot re-activate or edit a blocked link…
    for (const body of [{ status: "active" }, { targetUrl: "https://example.com/new" }]) {
      const patch = await app.request(
        `${BASE}/api/links/${slug}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${secretKey}`,
            "Content-Type": "application/json",
            "CF-Connecting-IP": crypto.randomUUID(),
          },
          body: JSON.stringify(body),
        },
        env,
      );
      expect(patch.status).toBe(403);
    }
    // …and the owner PATCH schema rejects "blocked" as a value outright.
    const forged = await app.request(
      `${BASE}/api/links/${slug}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json",
          "CF-Connecting-IP": crypto.randomUUID(),
        },
        body: JSON.stringify({ status: "blocked" }),
      },
      env,
    );
    expect(forged.status).toBe(400);

    // The redirect stays dead.
    const redirect = await app.request(`${BASE}/r/${slug}`, {}, env, createExecutionContext());
    expect(redirect.status).toBe(410);
  });
});
