import { HOUR_SERIES_MAX_DAYS, STATS_MAX_RANGE_DAYS } from "@qr-tracker/shared";
import type { DayPoint, HourPoint, StatsQuery, StatsResponse, TopEntry } from "@qr-tracker/shared";

import {
  addDays,
  inclusiveDayCount,
  localDayStartUtcMs,
  localToday,
  utcDayToLocalDate,
  utcInstantToLocalParts,
} from "../lib/timezone.js";
import type { LinkRow } from "../repositories/links.js";
import { fetchFirstScanAt, fetchStatsAggregates } from "../repositories/stats.js";
import type { TopRow } from "../repositories/stats.js";

function toTopEntries(rows: TopRow[]): TopEntry[] {
  return rows.map((row) => ({ value: row.value, count: row.count }));
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Computes the dashboard payload for one link over a local-date range. */
export async function computeStats(
  db: D1Database,
  link: LinkRow,
  query: StatsQuery,
): Promise<StatsResponse> {
  const { tz, includeBots } = query;
  const today = localToday(tz);

  const to = query.to ?? today;
  let from = query.from;
  if (from === undefined) {
    const firstIso = await fetchFirstScanAt(db, link.id, includeBots);
    from = firstIso === null ? to : utcInstantToLocalParts(Date.parse(firstIso), tz).date;
    if (from > to) from = to;
  }
  // Bound the series length (retention purges scans after ~1 year anyway).
  if (inclusiveDayCount(from, to) > STATS_MAX_RANGE_DAYS) {
    from = addDays(to, -(STATS_MAX_RANGE_DAYS - 1));
  }

  const startIso = new Date(localDayStartUtcMs(from, tz)).toISOString();
  const endIso = new Date(localDayStartUtcMs(addDays(to, 1), tz)).toISOString();

  const agg = await fetchStatsAggregates(db, link.id, startIso, endIso, includeBots);

  const byDayScans = new Map<string, number>();
  const byHourScans = new Map<string, number>();
  const hourOfDay: number[] = Array.from({ length: 24 }, () => 0);
  const dayOfWeek: number[] = Array.from({ length: 7 }, () => 0);

  for (const bucket of agg.hourly) {
    const parts = utcInstantToLocalParts(Date.parse(`${bucket.utc_hour}:00:00Z`), tz);
    byDayScans.set(parts.date, (byDayScans.get(parts.date) ?? 0) + bucket.scans);
    const hourKey = `${parts.date}T${pad(parts.hour)}:00`;
    byHourScans.set(hourKey, (byHourScans.get(hourKey) ?? 0) + bucket.scans);
    hourOfDay[parts.hour] = (hourOfDay[parts.hour] ?? 0) + bucket.scans;
    dayOfWeek[parts.dayOfWeek] = (dayOfWeek[parts.dayOfWeek] ?? 0) + bucket.scans;
  }

  const byDayUniques = new Map<string, number>();
  for (const row of agg.dailyUniques) {
    const localDate = utcDayToLocalDate(row.utc_day, tz);
    byDayUniques.set(localDate, (byDayUniques.get(localDate) ?? 0) + row.unique_visitors);
  }

  const byDay: DayPoint[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    byDay.push({
      date,
      scans: byDayScans.get(date) ?? 0,
      uniqueVisitors: byDayUniques.get(date) ?? 0,
    });
  }

  let byHour: HourPoint[] | null = null;
  if (inclusiveDayCount(from, to) <= HOUR_SERIES_MAX_DAYS) {
    byHour = [...byHourScans.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([hour, scans]) => ({ hour, scans }));
  }

  return {
    range: { from, to, tz, includeBots },
    totals: {
      scans: agg.totals.scans,
      uniqueVisitors: agg.uniqueTotal,
      firstScanAt: agg.totals.first_scan,
      lastScanAt: agg.totals.last_scan,
    },
    byDay,
    byHour,
    hourOfDay,
    dayOfWeek,
    topCountries: toTopEntries(agg.tops.country),
    topCities: toTopEntries(agg.tops.city),
    topDevices: toTopEntries(agg.tops.device_type),
    topOs: toTopEntries(agg.tops.os),
    topBrowsers: toTopEntries(agg.tops.browser),
    topLanguages: toTopEntries(agg.tops.language),
    topIsps: toTopEntries(agg.tops.as_organization),
  };
}
