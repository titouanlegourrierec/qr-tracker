#!/usr/bin/env node
/**
 * Admin kill switch CLI — disable or re-enable any slug.
 *
 * Usage:
 *   ADMIN_TOKEN=... node scripts/admin.mjs disable <slug> [--url https://qr-tracker.<account>.workers.dev]
 *   ADMIN_TOKEN=... node scripts/admin.mjs enable  <slug> [--url ...]
 *
 * The URL defaults to WORKER_URL from the environment, then localhost:8787.
 */

const [command, slug, ...rest] = process.argv.slice(2);

function usage(message) {
  console.error(`Error: ${message}`);
  console.error(
    "Usage: ADMIN_TOKEN=... node scripts/admin.mjs <disable|enable> <slug> [--url <worker-url>]",
  );
  process.exit(1);
}

if (command !== "disable" && command !== "enable") usage("command must be 'disable' or 'enable'");
if (!slug || !/^[0-9A-Za-z]{7}$/.test(slug)) usage("slug must be 7 base62 characters");

const token = process.env.ADMIN_TOKEN;
if (!token) usage("ADMIN_TOKEN environment variable is required");

const urlFlagIndex = rest.indexOf("--url");
const baseUrl =
  (urlFlagIndex !== -1 ? rest[urlFlagIndex + 1] : undefined) ??
  process.env.WORKER_URL ??
  "http://localhost:8787";

// Admin "disable" sets the blocked status, which the owner cannot lift.
const status = command === "disable" ? "blocked" : "active";
const response = await fetch(`${baseUrl}/api/admin/links/${slug}/status`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  body: JSON.stringify({ status }),
});

const body = await response.text();
if (!response.ok) {
  console.error(`Failed (${response.status}): ${body}`);
  process.exit(1);
}
console.log(`OK — ${slug} is now ${status}`);
console.log(body);
