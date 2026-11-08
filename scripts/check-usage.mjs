#!/usr/bin/env node
/**
 * Free-plan quota early warning (run hourly by .github/workflows/monitor.yml).
 *
 * Past a daily quota, Cloudflare stops serving the worker (requests) or D1 starts failing
 * (rows read / written): scans are lost, or printed QR codes stop working, until 00:00 UTC. This
 * script reads today's usage for the whole account from the GraphQL Analytics API and
 * exits with code 1 once any quota passes ALERT_RATIO, so the failed run e-mails the owner
 * while there is still time to react (docs/DEPLOYMENT.md §12).
 *
 * Env: CLOUDFLARE_API_TOKEN (needs Account → Account Analytics → Read) and
 * CLOUDFLARE_ACCOUNT_ID. When the API cannot be read (token without that permission,
 * Cloudflare outage), it prints a warning and exits 0: a broken metric must not page the
 * owner every hour; the uptime checks still run.
 */
import { appendFileSync } from "node:fs";

/** Workers Free and D1 Free daily limits, account-wide, reset at 00:00 UTC. */
const QUOTAS = {
  requests: { label: "Worker requests", limit: 100_000 },
  rowsRead: { label: "D1 rows read", limit: 5_000_000 },
  rowsWritten: { label: "D1 rows written", limit: 100_000 },
};
const ALERT_RATIO = 0.7;

const token = process.env.CLOUDFLARE_API_TOKEN ?? "";
const account = process.env.CLOUDFLARE_ACCOUNT_ID ?? "";

function warn(message) {
  console.log(`::warning::${message}`);
  process.exit(0);
}

if (token === "" || account === "") {
  warn("CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID is not set: quota check skipped.");
}

const now = new Date();
const since = `${now.toISOString().slice(0, 10)}T00:00:00Z`;
const until = now.toISOString().replace(/\.\d{3}Z$/, "Z");
// Values are inlined (JSON-quoted) rather than passed as variables: no scalar type names.
const query = `{
  viewer {
    accounts(filter: { accountTag: ${JSON.stringify(account)} }) {
      workersInvocationsAdaptive(
        limit: 10000
        filter: { datetime_geq: ${JSON.stringify(since)}, datetime_leq: ${JSON.stringify(until)} }
      ) {
        sum { requests }
      }
      d1AnalyticsAdaptiveGroups(
        limit: 10000
        filter: { datetimeHour_geq: ${JSON.stringify(since)}, datetimeHour_leq: ${JSON.stringify(until)} }
      ) {
        sum { rowsRead rowsWritten }
      }
    }
  }
}`;

let body;
try {
  const response = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(20_000),
  });
  body = await response.json();
} catch (error) {
  warn(`Could not reach the Cloudflare GraphQL API (${String(error)}).`);
}

if (Array.isArray(body?.errors) && body.errors.length > 0) {
  const messages = body.errors.map((e) => e.message).join("; ");
  warn(
    `Cloudflare usage is not readable: ${messages}. Give the API token the ` +
      `"Account Analytics: Read" permission (docs/DEPLOYMENT.md §12).`,
  );
}
const accountData = body?.data?.viewer?.accounts?.[0];
if (accountData === undefined) warn("Cloudflare returned no data for this account.");

const sumOf = (groups, field) =>
  (groups ?? []).reduce((total, group) => total + (group.sum?.[field] ?? 0), 0);
const used = {
  requests: sumOf(accountData.workersInvocationsAdaptive, "requests"),
  rowsRead: sumOf(accountData.d1AnalyticsAdaptiveGroups, "rowsRead"),
  rowsWritten: sumOf(accountData.d1AnalyticsAdaptiveGroups, "rowsWritten"),
};

const lines = [`Usage since ${since} (alert at ${ALERT_RATIO * 100} %):`];
const over = [];
for (const [key, { label, limit }] of Object.entries(QUOTAS)) {
  const ratio = used[key] / limit;
  lines.push(
    `- ${label}: ${used[key].toLocaleString("en")} / ${limit.toLocaleString("en")} (${(ratio * 100).toFixed(1)} %)`,
  );
  if (ratio >= ALERT_RATIO) over.push(label);
}
console.log(lines.join("\n"));
if (process.env.GITHUB_STEP_SUMMARY !== undefined) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
}

if (over.length > 0) {
  console.log(
    `::error::${over.join(", ")} above ${ALERT_RATIO * 100} % of the free plan's daily quota. ` +
      "Past 100 %, scans are lost or QR codes stop working until 00:00 UTC (docs/DEPLOYMENT.md §12).",
  );
  process.exit(1);
}
