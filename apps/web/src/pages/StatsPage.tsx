import { DEFAULT_TIMEZONE, secretKeySchema, slugSchema } from "@qr-tracker/shared";
import type { Link, StatsResponse } from "@qr-tracker/shared";
import { lazy, Suspense, useEffect, useState } from "react";
import type { SubmitEvent } from "react";
import { useParams } from "react-router";

import { ChartWithTable } from "../components/ChartWithTable.js";
import { CopyButton } from "../components/CopyButton.js";
import { ManagePanel } from "../components/ManagePanel.js";
import { TopList } from "../components/TopList.js";
import { API_URL } from "../config.js";
import { en } from "../i18n/en.js";
import { api, ApiRequestError } from "../lib/api.js";
import { countryName, isOnWorldMap, languageName } from "../lib/countries.js";
import { downloadBlob } from "../lib/download.js";

// The world topology and map code only load when a dashboard renders.
const GeoMapLoader = lazy(() => import("../components/GeoMapLoader.js"));

function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/** Today's YYYY-MM-DD in the given timezone (en-CA renders ISO dates). */
function todayIn(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
}

function shiftDate(date: string, days: number): string {
  const ms = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

function formatDateTime(iso: string | null, tz: string): string {
  if (iso === null) return en.stats.totals.never;
  return new Date(iso).toLocaleString("en-GB", { timeZone: tz });
}

function errorMessage(err: unknown): string {
  return err instanceof ApiRequestError ? en.errors[err.code] : en.app.error;
}

function deviceName(value: string): string {
  if (value in en.stats.devices) {
    return en.stats.devices[value as keyof typeof en.stats.devices];
  }
  return value;
}

type QuickRange = "7" | "30" | "all" | null;

interface Filters {
  from?: string;
  to?: string;
  includeBots: boolean;
}

interface Loaded {
  link: Link;
  stats: StatsResponse;
}

export function StatsPage() {
  const params = useParams();
  const slug = params.slug ?? "";
  const secretKey = params.key ?? "";
  // Opening another link's private URL only changes the hash, so React would reuse this
  // instance: remount instead, so no state (filters, loaded data, form fields such as the
  // destination being edited) can leak from one link to the next.
  return <StatsDashboard key={`${slug}/${secretKey}`} slug={slug} secretKey={secretKey} />;
}

function StatsDashboard({ slug, secretKey }: { slug: string; secretKey: string }) {
  const tz = browserTimezone();

  const validParams =
    slugSchema.safeParse(slug).success && secretKeySchema.safeParse(secretKey).success;

  const [filters, setFilters] = useState<Filters>({ includeBots: false });
  const [quick, setQuick] = useState<QuickRange>("all");
  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  // While refetching (filter change), the previous dashboard stays visible.
  const loading = data === null && error === null;

  useEffect(() => {
    if (!validParams) return;
    // Filters can change faster than the API answers: only the latest request may update
    // the page, so a slow response for an older filter never overwrites a newer one.
    let stale = false;
    Promise.all([
      api.getLink(slug, secretKey),
      api.getStats(slug, secretKey, {
        tz,
        includeBots: filters.includeBots,
        ...(filters.from !== undefined ? { from: filters.from } : {}),
        ...(filters.to !== undefined ? { to: filters.to } : {}),
      }),
    ])
      .then(([link, stats]) => {
        if (stale) return;
        setData({ link, stats });
        setError(null);
      })
      .catch((err: unknown) => {
        if (!stale) setError(errorMessage(err));
      });
    return () => {
      stale = true;
    };
  }, [validParams, slug, secretKey, tz, filters]);

  if (!validParams) {
    return (
      <>
        <h1>{en.stats.title}</h1>
        <p className="error-box" role="alert">
          {en.statsEntry.invalid}
        </p>
      </>
    );
  }

  function applyRange(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    // An empty field removes that bound; both empty is the same as "All time".
    setQuick(fromInput === "" && toInput === "" ? "all" : null);
    setFilters((current) => ({
      includeBots: current.includeBots,
      ...(fromInput === "" ? {} : { from: fromInput }),
      ...(toInput === "" ? {} : { to: toInput }),
    }));
  }

  function quickRange(days: number | null) {
    if (days === null) {
      setQuick("all");
      setFromInput("");
      setToInput("");
      setFilters((current) => ({ includeBots: current.includeBots }));
      return;
    }
    setQuick(days === 7 ? "7" : "30");
    const to = todayIn(tz);
    const from = shiftDate(to, -(days - 1));
    setFromInput(from);
    setToInput(to);
    setFilters((current) => ({ ...current, from, to }));
  }

  function exportCsv() {
    api
      .exportCsv(slug, secretKey, {
        includeBots: filters.includeBots,
        ...(filters.from !== undefined ? { from: filters.from } : {}),
        ...(filters.to !== undefined ? { to: filters.to } : {}),
      })
      .then((blob) => {
        downloadBlob(blob, `qr-${slug}-scans.csv`);
      })
      .catch((err: unknown) => {
        setError(errorMessage(err));
      });
  }

  const stats = data?.stats ?? null;
  const link = data?.link ?? null;
  const today = todayIn(tz);
  const shortUrl = link === null ? null : `${API_URL}/r/${link.slug}`;
  const hasGeo =
    stats?.topCountries.some((entry) => entry.value !== null && isOnWorldMap(entry.value)) ?? false;

  return (
    <>
      <h1>
        {en.stats.title}
        {link !== null && ` — ${link.label ?? link.slug}`}
      </h1>
      {shortUrl !== null && (
        <div className="copy-row">
          <code>{shortUrl}</code>
          <CopyButton value={shortUrl} />
        </div>
      )}

      {loading && (
        <p className="muted" role="status">
          {en.stats.loading}
        </p>
      )}
      {error !== null && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}

      {link !== null && stats !== null && (
        <>
          <div className="toolbar card">
            <form className="filters" onSubmit={applyRange}>
              <label className="field">
                <span>{en.stats.range.from}</span>
                <input
                  type="date"
                  max={today}
                  value={fromInput}
                  onChange={(e) => {
                    setFromInput(e.target.value);
                  }}
                />
              </label>
              <label className="field">
                <span>{en.stats.range.to}</span>
                <input
                  type="date"
                  max={today}
                  value={toInput}
                  onChange={(e) => {
                    setToInput(e.target.value);
                  }}
                />
              </label>
              <button type="submit">{en.stats.range.apply}</button>
              <div className="segmented" role="group">
                <button
                  type="button"
                  aria-pressed={quick === "7"}
                  onClick={() => {
                    quickRange(7);
                  }}
                >
                  {en.stats.range.last7}
                </button>
                <button
                  type="button"
                  aria-pressed={quick === "30"}
                  onClick={() => {
                    quickRange(30);
                  }}
                >
                  {en.stats.range.last30}
                </button>
                <button
                  type="button"
                  aria-pressed={quick === "all"}
                  onClick={() => {
                    quickRange(null);
                  }}
                >
                  {en.stats.range.all}
                </button>
              </div>
            </form>
            <div className="toolbar-row">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={filters.includeBots}
                  onChange={(e) => {
                    setFilters((current) => ({ ...current, includeBots: e.target.checked }));
                  }}
                />{" "}
                {en.stats.includeBots}
              </label>
              <button type="button" className="toolbar-export" onClick={exportCsv}>
                {en.stats.exportCsv}
              </button>
            </div>
          </div>

          <div className="totals-grid">
            <div className="card">
              <span className="value">{stats.totals.scans}</span>
              <span className="label">{en.stats.totals.scans}</span>
            </div>
            <div className="card">
              <span className="value">{stats.totals.uniqueVisitors}</span>
              <span className="label">{en.stats.totals.uniqueVisitors}</span>
            </div>
            <div className="card">
              <span className="value value-date">
                {formatDateTime(stats.totals.firstScanAt, tz)}
              </span>
              <span className="label">{en.stats.totals.firstScan}</span>
            </div>
            <div className="card">
              <span className="value value-date">
                {formatDateTime(stats.totals.lastScanAt, tz)}
              </span>
              <span className="label">{en.stats.totals.lastScan}</span>
            </div>
          </div>

          {stats.totals.scans === 0 ? (
            <p className="card">{en.stats.empty}</p>
          ) : (
            <>
              <h2 className="section-heading">{en.stats.sections.overTime}</h2>
              <div className="grid-2">
                {/* Per-hour data only exists for short ranges; per-day then takes the full row. */}
                <ChartWithTable
                  title={en.stats.charts.byDay}
                  type="line"
                  labels={stats.byDay.map((p) => p.date)}
                  values={stats.byDay.map((p) => p.scans)}
                  {...(stats.byHour === null ? { className: "span-2" } : {})}
                />
                {stats.byHour !== null && (
                  <ChartWithTable
                    title={en.stats.charts.byHour}
                    type="bar"
                    labels={stats.byHour.map((p) => p.hour.replace("T", " "))}
                    values={stats.byHour.map((p) => p.scans)}
                  />
                )}
              </div>

              <h2 className="section-heading">{en.stats.sections.where}</h2>
              <div className="card">
                <h3>{en.stats.map.title}</h3>
                <Suspense fallback={<p className="muted">{en.app.loading}</p>}>
                  <GeoMapLoader entries={stats.topCountries} />
                </Suspense>
                <p className="muted map-hint">{hasGeo ? en.stats.map.hint : en.stats.map.empty}</p>
              </div>
              <div className="grid-2">
                <TopList
                  title={en.stats.tops.countries}
                  entries={stats.topCountries}
                  format={countryName}
                />
                <TopList title={en.stats.tops.cities} entries={stats.topCities} />
              </div>

              <h2 className="section-heading">{en.stats.sections.when}</h2>
              <div className="grid-2">
                <ChartWithTable
                  title={en.stats.charts.hourOfDay}
                  type="bar"
                  labels={stats.hourOfDay.map((_, hour) => `${hour}:00`)}
                  values={stats.hourOfDay}
                />
                <ChartWithTable
                  title={en.stats.charts.dayOfWeek}
                  type="bar"
                  labels={[...en.stats.days]}
                  values={stats.dayOfWeek}
                />
              </div>

              <h2 className="section-heading">{en.stats.sections.audience}</h2>
              <div className="tops-grid">
                <TopList
                  title={en.stats.tops.devices}
                  entries={stats.topDevices}
                  format={deviceName}
                />
                <TopList title={en.stats.tops.os} entries={stats.topOs} />
                <TopList title={en.stats.tops.browsers} entries={stats.topBrowsers} />
                <TopList
                  title={en.stats.tops.languages}
                  entries={stats.topLanguages}
                  format={languageName}
                />
              </div>
            </>
          )}

          <ManagePanel
            link={link}
            secretKey={secretKey}
            onUpdated={(updated) => {
              setData((current) => (current === null ? null : { ...current, link: updated }));
            }}
          />
        </>
      )}
    </>
  );
}
