import { CSV_COLUMNS, TOP_LIMIT } from "@qr-tracker/shared";

export interface HourlyRow {
  utc_hour: string; // "YYYY-MM-DDTHH"
  scans: number;
}

export interface DailyUniqueRow {
  utc_day: string; // "YYYY-MM-DD"
  unique_visitors: number;
}

export interface TotalsRow {
  scans: number;
  first_scan: string | null;
  last_scan: string | null;
}

export interface TopRow {
  value: string | null;
  count: number;
}

export interface CityTopRow extends TopRow {
  country: string | null;
}

export interface StatsAggregates {
  totals: TotalsRow;
  /** Distinct visitor hashes summed per UTC day (hashes rotate daily). */
  uniqueTotal: number;
  hourly: HourlyRow[];
  dailyUniques: DailyUniqueRow[];
  tops: {
    country: TopRow[];
    city: CityTopRow[];
    device_type: TopRow[];
    os: TopRow[];
    browser: TopRow[];
    language: TopRow[];
  };
}

/**
 * Columns exposed as "top …" lists. Interpolated into SQL — fixed allowlist only.
 * Cities have their own query (ranked per country).
 */
const TOP_COLUMNS = ["country", "device_type", "os", "browser", "language"] as const;

function rowsOf<T>(result: D1Result): T[] {
  return result.results as T[];
}

export async function fetchFirstScanAt(
  db: D1Database,
  linkId: number,
  includeBots: boolean,
): Promise<string | null> {
  const botFilter = includeBots ? "" : " AND is_bot = 0";
  const row = await db
    .prepare(`SELECT MIN(scanned_at) AS first_scan FROM scans WHERE link_id = ?1${botFilter}`)
    .bind(linkId)
    .first<{ first_scan: string | null }>();
  return row?.first_scan ?? null;
}

/**
 * All stats aggregates in one atomic D1 batch (uses idx_scans_link_time).
 * Range is [startIso, endIso) over scanned_at (UTC).
 */
export async function fetchStatsAggregates(
  db: D1Database,
  linkId: number,
  startIso: string,
  endIso: string,
  includeBots: boolean,
): Promise<StatsAggregates> {
  const botFilter = includeBots ? "" : " AND is_bot = 0";
  const where = `FROM scans WHERE link_id = ?1 AND scanned_at >= ?2 AND scanned_at < ?3${botFilter}`;
  const bindAll = (sql: string) => db.prepare(sql).bind(linkId, startIso, endIso);

  const statements = [
    bindAll(
      `SELECT COUNT(*) AS scans, MIN(scanned_at) AS first_scan, MAX(scanned_at) AS last_scan ${where}`,
    ),
    bindAll(
      `SELECT COUNT(*) AS n FROM (SELECT DISTINCT date(scanned_at) AS d, visitor_hash ${where})`,
    ),
    bindAll(
      `SELECT strftime('%Y-%m-%dT%H', scanned_at) AS utc_hour, COUNT(*) AS scans
       ${where} GROUP BY utc_hour ORDER BY utc_hour`,
    ),
    bindAll(
      `SELECT date(scanned_at) AS utc_day, COUNT(DISTINCT visitor_hash) AS unique_visitors
       ${where} GROUP BY utc_day ORDER BY utc_day`,
    ),
    // Same city name in different countries = different rows; unknown cities are
    // grouped together whatever their country.
    bindAll(
      `SELECT city AS value, CASE WHEN city IS NULL THEN NULL ELSE country END AS city_country,
              COUNT(*) AS count
       ${where} GROUP BY city_country, value
       ORDER BY count DESC, value ASC, city_country ASC LIMIT ${TOP_LIMIT}`,
    ),
    ...TOP_COLUMNS.map((column) =>
      bindAll(
        `SELECT ${column} AS value, COUNT(*) AS count ${where}
         GROUP BY ${column} ORDER BY count DESC, value ASC LIMIT ${TOP_LIMIT}`,
      ),
    ),
  ];

  const results = await db.batch(statements);
  const [totalsRes, uniqueRes, hourlyRes, dailyRes, cityRes, ...topRes] = results;
  if (
    totalsRes === undefined ||
    uniqueRes === undefined ||
    hourlyRes === undefined ||
    dailyRes === undefined ||
    cityRes === undefined ||
    topRes.length !== TOP_COLUMNS.length
  ) {
    throw new Error("Stats batch returned an unexpected number of results");
  }

  const totals = rowsOf<TotalsRow>(totalsRes)[0] ?? {
    scans: 0,
    first_scan: null,
    last_scan: null,
  };
  const uniqueTotal = rowsOf<{ n: number }>(uniqueRes)[0]?.n ?? 0;

  const topByColumn = {} as Record<(typeof TOP_COLUMNS)[number], TopRow[]>;
  TOP_COLUMNS.forEach((column, i) => {
    const res = topRes[i];
    topByColumn[column] = res === undefined ? [] : rowsOf<TopRow>(res);
  });
  const city = rowsOf<{ value: string | null; city_country: string | null; count: number }>(
    cityRes,
  ).map((row) => ({ value: row.value, country: row.city_country, count: row.count }));

  return {
    totals,
    uniqueTotal,
    hourly: rowsOf<HourlyRow>(hourlyRes),
    dailyUniques: rowsOf<DailyUniqueRow>(dailyRes),
    tops: { ...topByColumn, city },
  };
}

export interface ScanSummaryRow {
  scans: number;
  last_scan: string | null;
}

/**
 * Human scan count and latest scan per link, for "My QR codes" (one grouped query over
 * idx_scans_link_time). Links without scans are absent from the map.
 */
export async function fetchScanSummaries(
  db: D1Database,
  linkIds: number[],
): Promise<Map<number, ScanSummaryRow>> {
  if (linkIds.length === 0) return new Map();
  const placeholders = linkIds.map((_, i) => `?${i + 1}`).join(", ");
  const result = await db
    .prepare(
      `SELECT link_id, COUNT(*) AS scans, MAX(scanned_at) AS last_scan FROM scans
       WHERE link_id IN (${placeholders}) AND is_bot = 0 GROUP BY link_id`,
    )
    .bind(...linkIds)
    .all<ScanSummaryRow & { link_id: number }>();
  return new Map(result.results.map(({ link_id, ...row }) => [link_id, row]));
}

export interface ExportRow extends Record<string, unknown> {
  scanned_at: string;
  country: string | null;
  region: string | null;
  city: string | null;
  timezone: string | null;
  device_type: string;
  os: string | null;
  browser: string | null;
  language: string | null;
  is_bot: number;
  visitor_hash: string;
}

/** Anonymous scan rows for CSV export, oldest first, capped at `maxRows`. */
export async function fetchScansForExport(
  db: D1Database,
  linkId: number,
  range: { startIso?: string; endIso?: string },
  includeBots: boolean,
  maxRows: number,
): Promise<ExportRow[]> {
  const botFilter = includeBots ? "" : " AND is_bot = 0";
  const result = await db
    .prepare(
      `SELECT ${CSV_COLUMNS.join(", ")} FROM scans
       WHERE link_id = ?1 AND scanned_at >= ?2 AND scanned_at < ?3${botFilter}
       ORDER BY scanned_at LIMIT ${maxRows}`,
    )
    .bind(linkId, range.startIso ?? "0000", range.endIso ?? "9999")
    .all();
  return rowsOf<ExportRow>(result);
}
