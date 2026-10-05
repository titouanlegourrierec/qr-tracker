#!/usr/bin/env node
/**
 * Operator CLI — kill switch and abuse-report queue.
 *
 * Usage:
 *   ADMIN_TOKEN=... node scripts/admin.mjs disable <slug>   block a link (the owner cannot lift it)
 *   ADMIN_TOKEN=... node scripts/admin.mjs enable  <slug>   lift a block
 *   ADMIN_TOKEN=... node scripts/admin.mjs reports [--limit N] [--fail-if-any]
 *                                                           list abuse reports, newest first
 *   ADMIN_TOKEN=... node scripts/admin.mjs dismiss <slug>   delete a link's reports once handled
 *
 * Every command accepts --url https://qr-tracker.<account>.workers.dev; it defaults to
 * WORKER_URL from the environment, then localhost:8787. `reports --fail-if-any` prints only
 * counts and exits with code 3 when reports are waiting (used by the scheduled
 * .github/workflows/abuse-reports.yml check).
 */

const COMMANDS = ["disable", "enable", "reports", "dismiss"];
const [command, ...rest] = process.argv.slice(2);

function usage(message) {
  console.error(`Error: ${message}`);
  console.error(
    "Usage: ADMIN_TOKEN=... node scripts/admin.mjs <disable|enable|dismiss> <slug> [--url <worker-url>]\n" +
      "       ADMIN_TOKEN=... node scripts/admin.mjs reports [--limit N] [--fail-if-any] [--url <worker-url>]",
  );
  process.exit(1);
}

function flagValue(name) {
  const index = rest.indexOf(name);
  return index === -1 ? undefined : rest[index + 1];
}

if (!COMMANDS.includes(command)) usage(`command must be one of: ${COMMANDS.join(", ")}`);

const token = process.env.ADMIN_TOKEN;
if (!token) usage("ADMIN_TOKEN environment variable is required");

const baseUrl = flagValue("--url") ?? process.env.WORKER_URL ?? "http://localhost:8787";
const authHeaders = { Authorization: `Bearer ${token}` };

async function call(method, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers:
      body === undefined ? authHeaders : { ...authHeaders, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  if (!response.ok) {
    console.error(`Failed (${response.status}): ${text}`);
    process.exit(1);
  }
  return JSON.parse(text);
}

function requireSlug() {
  const slug = rest[0];
  if (!slug || !/^[0-9A-Za-z]{7}$/.test(slug)) usage("slug must be 7 base62 characters");
  return slug;
}

if (command === "disable" || command === "enable") {
  const slug = requireSlug();
  // Admin "disable" sets the blocked status, which the owner cannot lift.
  const status = command === "disable" ? "blocked" : "active";
  const link = await call("POST", `/api/admin/links/${slug}/status`, { status });
  console.log(`OK — ${slug} is now ${status}`);
  console.log(JSON.stringify(link, null, 2));
} else if (command === "dismiss") {
  const slug = requireSlug();
  const { dismissed } = await call("DELETE", `/api/admin/links/${slug}/reports`);
  console.log(`OK — dismissed ${dismissed} report(s) for ${slug}`);
} else {
  const limit = flagValue("--limit");
  const { reports } = await call("GET", `/api/admin/reports${limit ? `?limit=${limit}` : ""}`);
  if (reports.length === 0) {
    console.log("No abuse reports.");
    process.exit(0);
  }
  if (rest.includes("--fail-if-any")) {
    // CI mode: counts only. Report details and destinations stay out of workflow logs,
    // which become public if the repository does.
    const links = new Set(reports.map((r) => r.slug)).size;
    console.error(`${reports.length} abuse report(s) on ${links} link(s) are waiting for review.`);
    process.exit(3);
  }

  // One block per reported link, most recently reported first (the API sorts newest first).
  const bySlug = new Map();
  for (const report of reports) {
    const group = bySlug.get(report.slug) ?? { ...report, items: [] };
    group.items.push(report);
    bySlug.set(report.slug, group);
  }
  for (const group of bySlug.values()) {
    const reasons = [...new Set(group.items.map((r) => r.reason))].join(", ");
    console.log(
      `\n${group.slug} [${group.linkStatus}] — ${group.items.length} report(s): ${reasons}`,
    );
    console.log(`  → ${group.targetUrl}`);
    for (const item of group.items) {
      const details = item.details === null ? "" : ` — ${item.details.replace(/\s+/g, " ")}`;
      console.log(`  ${item.createdAt} ${item.reason}${details}`);
    }
  }
  console.log(
    `\n${reports.length} report(s) on ${bySlug.size} link(s). Block with \`disable <slug>\`, ` +
      "then clear with `dismiss <slug>`.",
  );
}
