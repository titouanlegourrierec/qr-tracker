#!/usr/bin/env node
/**
 * Dependency license gate (part of `pnpm check`, so CI and every deploy run it).
 *
 * - Code shipped to visitors or run by the worker (production dependencies) must be under a
 *   permissive license.
 * - Build and test tools may also use weak-copyleft licenses: they are used unmodified and
 *   never shipped.
 * - Anything else — AGPL (e.g. ua-parser-js v2), GPL, SSPL, BUSL, unknown or missing
 *   licenses — fails the check. To accept a new license, add it here with the reason.
 *
 * Usage: node scripts/check-licenses.mjs
 */
import { execFileSync } from "node:child_process";

/** Fine anywhere, including in the web app and the worker. */
const SHIPPABLE = new Set([
  "0BSD",
  "Apache-2.0",
  "BlueOak-1.0.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "CC0-1.0",
  "ISC",
  "MIT",
  "MIT-0",
  "OFL-1.1", // fonts (@fontsource-variable/inter)
  "Unlicense",
]);

/** Accepted for build and test tooling only (never shipped, used unmodified). */
const TOOLING_ONLY = new Set([
  "CC-BY-4.0", // browser-support data (caniuse-lite)
  "LGPL-3.0-or-later", // image library loaded by wrangler's local runtime (sharp/libvips)
  "MPL-2.0", // CSS minifier (lightningcss)
  "Python-2.0", // argparse
]);

/** `pnpm licenses list --json`: { [license]: [{ name, versions, … }] }. */
function listLicenses(prodOnly) {
  const args = ["licenses", "list", "--json", ...(prodOnly ? ["--prod"] : [])];
  const output = execFileSync("pnpm", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const packages = [];
  for (const [license, entries] of Object.entries(JSON.parse(output))) {
    for (const entry of entries) {
      for (const version of entry.versions) {
        packages.push({ id: `${entry.name}@${version}`, license });
      }
    }
  }
  return packages;
}

/**
 * True when an SPDX expression is satisfied by the allowed set: one alternative of an
 * "OR" must be fully allowed, every part of an "AND" must be. Parentheses are ignored,
 * which is enough for the flat expressions npm packages use.
 */
function satisfies(expression, allowed) {
  return expression
    .replace(/[()]/g, " ")
    .trim()
    .split(/\s+OR\s+/)
    .some((alternative) => alternative.split(/\s+AND\s+/).every((id) => allowed.has(id.trim())));
}

const shipped = new Set(listLicenses(true).map((pkg) => pkg.id));
const tooling = new Set([...SHIPPABLE, ...TOOLING_ONLY]);
const violations = listLicenses(false).filter(
  (pkg) => !satisfies(pkg.license, shipped.has(pkg.id) ? SHIPPABLE : tooling),
);

if (violations.length > 0) {
  console.error("Dependencies with a license that is not accepted (scripts/check-licenses.mjs):");
  for (const pkg of violations) {
    const where = shipped.has(pkg.id) ? "shipped" : "tooling";
    console.error(`  ${pkg.id}: ${pkg.license} (${where})`);
  }
  process.exit(1);
}
console.log(`Licenses OK: ${shipped.size} shipped and all tooling dependencies are accepted.`);
