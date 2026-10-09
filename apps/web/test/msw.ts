import type { StatsResponse } from "@qr-tracker/shared";
import { setupServer } from "msw/node";

/** Shared MSW server; individual tests add handlers with server.use(...). */
export const server = setupServer();

export const SLUG = "Ab3xY9z";
export const KEY = "k".repeat(43);

export function makeStats(overrides: Partial<StatsResponse> = {}): StatsResponse {
  return {
    range: { from: "2026-09-01", to: "2026-09-28", tz: "Europe/Paris", includeBots: false },
    totals: {
      scans: 42,
      uniqueVisitors: 17,
      firstScanAt: "2026-09-02T08:00:00.000Z",
      lastScanAt: "2026-09-27T18:30:00.000Z",
    },
    byDay: [
      { date: "2026-09-26", scans: 12, uniqueVisitors: 5 },
      { date: "2026-09-27", scans: 30, uniqueVisitors: 12 },
    ],
    byHour: null,
    hourOfDay: Array.from({ length: 24 }, (_, i) => (i === 14 ? 30 : 0)),
    dayOfWeek: [5, 0, 0, 0, 0, 30, 7],
    topCountries: [
      { value: "FR", count: 39 },
      { value: null, count: 3 },
    ],
    topCities: [
      { value: "Paris", country: "FR", count: 20 },
      { value: "Paris", country: "US", count: 2 },
    ],
    topDevices: [{ value: "mobile", count: 35 }],
    topOs: [{ value: "iOS", count: 22 }],
    topBrowsers: [{ value: "Mobile Safari", count: 22 }],
    topLanguages: [{ value: "fr", count: 38 }],
    topIsps: [],
    ...overrides,
  };
}
