import { env } from "cloudflare:workers";

import { QUERY_DATE_MAX, STATS_MAX_RANGE_DAYS, statsResponseSchema } from "@qr-tracker/shared";
import type { StatsResponse } from "@qr-tracker/shared";
import { beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { sha256Hex } from "../src/lib/crypto.js";

const app = createApp();
const BASE = "https://qr-tracker.example.workers.dev";
const KEY = "k".repeat(43);

let linkId = 0;

interface ScanSeed {
  at: string;
  hash: string;
  country?: string;
  city?: string;
  device?: string;
  os?: string;
  browser?: string;
  language?: string;
  isp?: string;
  bot?: boolean;
}

async function seedScan(seed: ScanSeed): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO scans (link_id, scanned_at, country, region, city, timezone, as_organization,
                        device_type, os, browser, language, is_bot, visitor_hash)
     VALUES (?1, ?2, ?3, NULL, ?4, NULL, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
  )
    .bind(
      linkId,
      seed.at,
      seed.country ?? "FR",
      seed.city ?? "Paris",
      seed.isp ?? "Orange",
      seed.device ?? "mobile",
      seed.os ?? "iOS",
      seed.browser ?? "Mobile Safari",
      seed.language ?? "fr",
      seed.bot === true ? 1 : 0,
      seed.hash,
    )
    .run();
}

async function fetchStats(params: string): Promise<{ status: number; body: StatsResponse }> {
  const res = await app.request(
    `${BASE}/api/links/statlnk/stats${params}`,
    { headers: { Authorization: `Bearer ${KEY}`, "CF-Connecting-IP": crypto.randomUUID() } },
    env,
  );
  return { status: res.status, body: await res.json<StatsResponse>() };
}

beforeAll(async () => {
  const now = "2026-09-01T00:00:00.000Z";
  const row = await env.DB.prepare(
    `INSERT INTO links (slug, target_url, label, secret_hash, status, created_at, updated_at)
     VALUES ('statlnk', 'https://example.com', NULL, ?1, 'active', ?2, ?2) RETURNING id`,
  )
    .bind(await sha256Hex(KEY), now)
    .first<{ id: number }>();
  linkId = row?.id ?? 0;

  // 2026-09-07 is a Monday. Scans span a UTC-day boundary that stays within
  // the same Paris local day window (22:30Z on the 7th = 00:30 local on the 8th).
  await seedScan({ at: "2026-09-07T08:15:00.000Z", hash: "v1" }); // Paris: Mon 10h
  await seedScan({ at: "2026-09-07T09:40:00.000Z", hash: "v1" }); // same visitor, Mon 11h
  await seedScan({
    at: "2026-09-07T22:30:00.000Z",
    hash: "v2",
    country: "DE",
    city: "Berlin",
    device: "desktop",
    os: "Windows",
    browser: "Chrome",
    language: "de",
    isp: "Telekom",
  }); // Paris: Tue 00h (the 8th)
  await seedScan({ at: "2026-09-08T10:00:00.000Z", hash: "v3" }); // Paris: Tue 12h
  await seedScan({ at: "2026-09-08T11:00:00.000Z", hash: "bot1", bot: true });
});

describe("GET /api/links/:slug/stats", () => {
  it("aggregates totals, series and tops in the requested timezone", async () => {
    const { status, body } = await fetchStats("?from=2026-09-07&to=2026-09-08&tz=Europe/Paris");
    expect(status).toBe(200);
    expect(statsResponseSchema.parse(body)).toBeTruthy();

    expect(body.totals.scans).toBe(4); // bot excluded by default
    expect(body.totals.uniqueVisitors).toBe(3);
    expect(body.totals.firstScanAt).toBe("2026-09-07T08:15:00.000Z");
    expect(body.totals.lastScanAt).toBe("2026-09-08T10:00:00.000Z");

    // Unique visitors are per-UTC-day (salt rotation): v1+v2 on the 7th, v3 on the 8th.
    expect(body.byDay).toEqual([
      { date: "2026-09-07", scans: 2, uniqueVisitors: 2 },
      { date: "2026-09-08", scans: 2, uniqueVisitors: 1 },
    ]);

    // Local hours: 10h, 11h (Mon) and 00h, 12h (Tue).
    expect(body.hourOfDay[10]).toBe(1);
    expect(body.hourOfDay[11]).toBe(1);
    expect(body.hourOfDay[0]).toBe(1);
    expect(body.hourOfDay[12]).toBe(1);
    expect(body.dayOfWeek[0]).toBe(2); // Monday
    expect(body.dayOfWeek[1]).toBe(2); // Tuesday

    expect(body.byHour).not.toBeNull();
    expect(body.byHour?.[0]).toEqual({ hour: "2026-09-07T10:00", scans: 1 });

    expect(body.topCities).toEqual([
      { value: "Paris", country: "FR", count: 3 },
      { value: "Berlin", country: "DE", count: 1 },
    ]);
    expect(body.topCountries[0]).toEqual({ value: "FR", count: 3 });
    expect(body.topCountries[1]).toEqual({ value: "DE", count: 1 });
    expect(body.topDevices[0]?.value).toBe("mobile");
    expect(body.topLanguages[0]?.value).toBe("fr");
    expect(body.topIsps[0]?.value).toBe("Orange");
  });

  it("ranks cities per country so homonyms stay apart", async () => {
    const now = "2026-09-01T00:00:00.000Z";
    const key = "c".repeat(43);
    const link = await env.DB.prepare(
      `INSERT INTO links (slug, target_url, label, secret_hash, status, created_at, updated_at)
       VALUES ('citylnk', 'https://example.com/', NULL, ?1, 'active', ?2, ?2) RETURNING id`,
    )
      .bind(await sha256Hex(key), now)
      .first<{ id: number }>();
    for (const [country, city] of [
      ["FR", "Paris"],
      ["FR", "Paris"],
      ["US", "Paris"],
      ["FR", null],
      ["DE", null],
    ] as const) {
      await env.DB.prepare(
        `INSERT INTO scans (link_id, scanned_at, country, city, visitor_hash)
         VALUES (?1, '2026-09-10T12:00:00.000Z', ?2, ?3, 'h')`,
      )
        .bind(link?.id, country, city)
        .run();
    }
    const res = await app.request(
      `${BASE}/api/links/citylnk/stats?from=2026-09-10&to=2026-09-10&tz=UTC`,
      { headers: { Authorization: `Bearer ${key}` } },
      env,
    );
    const body = await res.json<StatsResponse>();
    expect(body.topCities).toEqual([
      // Unknown cities are one row, whatever their country (ties sort NULL first).
      { value: null, country: null, count: 2 },
      { value: "Paris", country: "FR", count: 2 },
      { value: "Paris", country: "US", count: 1 },
    ]);
  });

  it("shifts day attribution with the timezone", async () => {
    const utc = await fetchStats("?from=2026-09-07&to=2026-09-08&tz=UTC");
    expect(utc.body.byDay).toEqual([
      { date: "2026-09-07", scans: 3, uniqueVisitors: 2 },
      { date: "2026-09-08", scans: 1, uniqueVisitors: 1 },
    ]);
  });

  it("includes bots only when requested", async () => {
    const withBots = await fetchStats(
      "?from=2026-09-07&to=2026-09-08&tz=Europe/Paris&includeBots=true",
    );
    expect(withBots.body.totals.scans).toBe(5);
  });

  it("filters by date range", async () => {
    const { body } = await fetchStats("?from=2026-09-08&to=2026-09-08&tz=UTC");
    expect(body.totals.scans).toBe(1);
    expect(body.byDay).toHaveLength(1);
  });

  it("defaults the range to first scan → today and nulls byHour on wide ranges", async () => {
    const { body } = await fetchStats("?tz=Europe/Paris");
    expect(body.range.from).toBe("2026-09-07");
    expect(body.byHour).toBeNull(); // today (2026-09-28+) − first scan > 14 days
    expect(statsResponseSchema.parse(body)).toBeTruthy();
  });

  it("clamps the widest accepted range to STATS_MAX_RANGE_DAYS days", async () => {
    const { status, body } = await fetchStats(`?to=${QUERY_DATE_MAX}&tz=UTC`);
    expect(status).toBe(200);
    expect(body.byDay).toHaveLength(STATS_MAX_RANGE_DAYS);
    expect(body.byDay.at(-1)?.date).toBe(QUERY_DATE_MAX);
  });

  it("rejects bad queries and wrong keys", async () => {
    const bad = await app.request(
      `${BASE}/api/links/statlnk/stats?tz=Mars/Olympus`,
      { headers: { Authorization: `Bearer ${KEY}` } },
      env,
    );
    expect(bad.status).toBe(400);

    // Used to loop forever: the day after 9999-12-31 is "+010000-01", which sorts first.
    const farFuture = await app.request(
      `${BASE}/api/links/statlnk/stats?to=9999-12-31`,
      { headers: { Authorization: `Bearer ${KEY}` } },
      env,
    );
    expect(farFuture.status).toBe(400);

    const unauth = await app.request(
      `${BASE}/api/links/statlnk/stats`,
      { headers: { Authorization: `Bearer ${"x".repeat(43)}` } },
      env,
    );
    expect(unauth.status).toBe(401);
  });
});

describe("GET /api/links/:slug/export", () => {
  it("returns CSV with headers, excluding bots by default", async () => {
    const res = await app.request(
      `${BASE}/api/links/statlnk/export`,
      { headers: { Authorization: `Bearer ${KEY}`, "CF-Connecting-IP": crypto.randomUUID() } },
      env,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toContain("qr-statlnk-scans.csv");

    const lines = (await res.text()).trim().split("\r\n");
    expect(lines[0]).toBe(
      "scanned_at,country,region,city,timezone,as_organization,device_type,os,browser,language,is_bot,visitor_hash",
    );
    expect(lines).toHaveLength(1 + 4);
    expect(lines[1]).toContain("2026-09-07T08:15:00.000Z");
  });

  it("includes bots and honors date filters", async () => {
    const res = await app.request(
      `${BASE}/api/links/statlnk/export?includeBots=true&from=2026-09-08&to=2026-09-08&tz=UTC`,
      { headers: { Authorization: `Bearer ${KEY}`, "CF-Connecting-IP": crypto.randomUUID() } },
      env,
    );
    const lines = (await res.text()).trim().split("\r\n");
    expect(lines).toHaveLength(1 + 2);
  });

  it("reads the date filters in the requested timezone, like the dashboard", async () => {
    async function exportedRows(params: string): Promise<string[]> {
      const res = await app.request(
        `${BASE}/api/links/statlnk/export${params}`,
        { headers: { Authorization: `Bearer ${KEY}`, "CF-Connecting-IP": crypto.randomUUID() } },
        env,
      );
      return (await res.text()).trim().split("\r\n").slice(1);
    }
    // 22:30Z on the 7th is already the 8th in Paris, as on the dashboard.
    const paris = await exportedRows("?from=2026-09-08&to=2026-09-08&tz=Europe/Paris");
    expect(paris).toHaveLength(2);
    expect(paris[0]).toContain("2026-09-07T22:30:00.000Z");
    const utc = await exportedRows("?from=2026-09-08&to=2026-09-08&tz=UTC");
    expect(utc).toHaveLength(1);
    expect(utc[0]).toContain("2026-09-08T10:00:00.000Z");
  });

  it("requires authentication", async () => {
    const res = await app.request(`${BASE}/api/links/statlnk/export`, {}, env);
    expect(res.status).toBe(401);
  });
});
