import { DEFAULT_TIMEZONE, secretKeySchema, slugSchema } from "@qr-tracker/shared";
import type { Link, StatsResponse } from "@qr-tracker/shared";
import { useCallback, useEffect, useState } from "react";
import type { SubmitEvent } from "react";
import { useParams } from "react-router";

import { ChartWithTable } from "../components/ChartWithTable.js";
import { CopyButton } from "../components/CopyButton.js";
import { ManagePanel } from "../components/ManagePanel.js";
import { TopList } from "../components/TopList.js";
import { API_URL } from "../config.js";
import { en } from "../i18n/en.js";
import { api, ApiRequestError } from "../lib/api.js";
import { downloadBlob } from "../lib/download.js";

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
  const tz = browserTimezone();

  const validParams =
    slugSchema.safeParse(slug).success && secretKeySchema.safeParse(secretKey).success;

  const [filters, setFilters] = useState<Filters>({ includeBots: false });
  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  // While refetching (filter change), the previous dashboard stays visible.
  const loading = data === null && error === null;

  const load = useCallback(() => {
    if (!validParams) return;
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
        setData({ link, stats });
        setError(null);
      })
      .catch((err: unknown) => {
        setError(errorMessage(err));
      });
  }, [validParams, slug, secretKey, tz, filters]);

  useEffect(() => {
    load();
  }, [load]);

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
    setFilters((current) => ({
      ...current,
      ...(fromInput === "" ? {} : { from: fromInput }),
      ...(toInput === "" ? {} : { to: toInput }),
    }));
  }

  function quickRange(days: number | null) {
    if (days === null) {
      setFromInput("");
      setToInput("");
      setFilters((current) => ({ includeBots: current.includeBots }));
      return;
    }
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
  const shortUrl = link === null ? null : `${API_URL}/r/${link.slug}`;

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
          <div className="filters card">
            <form className="filters" onSubmit={applyRange}>
              <label className="field">
                <span>{en.stats.range.from}</span>
                <input
                  type="date"
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
                  value={toInput}
                  onChange={(e) => {
                    setToInput(e.target.value);
                  }}
                />
              </label>
              <button type="submit">{en.stats.range.apply}</button>
              <button
                type="button"
                onClick={() => {
                  quickRange(7);
                }}
              >
                {en.stats.range.last7}
              </button>
              <button
                type="button"
                onClick={() => {
                  quickRange(30);
                }}
              >
                {en.stats.range.last30}
              </button>
              <button
                type="button"
                onClick={() => {
                  quickRange(null);
                }}
              >
                {en.stats.range.all}
              </button>
            </form>
            <label>
              <input
                type="checkbox"
                checked={filters.includeBots}
                onChange={(e) => {
                  setFilters((current) => ({ ...current, includeBots: e.target.checked }));
                }}
              />{" "}
              {en.stats.includeBots}
            </label>
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
              <span className="value" style={{ fontSize: "1rem" }}>
                {formatDateTime(stats.totals.firstScanAt, tz)}
              </span>
              <span className="label">{en.stats.totals.firstScan}</span>
            </div>
            <div className="card">
              <span className="value" style={{ fontSize: "1rem" }}>
                {formatDateTime(stats.totals.lastScanAt, tz)}
              </span>
              <span className="label">{en.stats.totals.lastScan}</span>
            </div>
          </div>

          {stats.totals.scans === 0 ? (
            <p className="card">{en.stats.empty}</p>
          ) : (
            <div className="charts-grid">
              <ChartWithTable
                title={en.stats.charts.byDay}
                type="line"
                labels={stats.byDay.map((p) => p.date)}
                values={stats.byDay.map((p) => p.scans)}
              />
              {stats.byHour !== null && (
                <ChartWithTable
                  title={en.stats.charts.byHour}
                  type="bar"
                  labels={stats.byHour.map((p) => p.hour.replace("T", " "))}
                  values={stats.byHour.map((p) => p.scans)}
                />
              )}
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
          )}

          <div className="actions-row">
            <button type="button" onClick={exportCsv}>
              {en.stats.exportCsv}
            </button>
          </div>

          <div className="tops-grid">
            <TopList title={en.stats.tops.countries} entries={stats.topCountries} />
            <TopList title={en.stats.tops.cities} entries={stats.topCities} />
            <TopList title={en.stats.tops.devices} entries={stats.topDevices} />
            <TopList title={en.stats.tops.os} entries={stats.topOs} />
            <TopList title={en.stats.tops.browsers} entries={stats.topBrowsers} />
            <TopList title={en.stats.tops.languages} entries={stats.topLanguages} />
            <TopList title={en.stats.tops.isps} entries={stats.topIsps} />
          </div>

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
