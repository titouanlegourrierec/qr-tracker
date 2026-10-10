import { validateTargetUrl } from "@qr-tracker/shared";
import type {
  CreateLinkRequest,
  CreateLinkResponse,
  LinkSummariesRequest,
  LinkSummary,
  UpdateLinkRequest,
} from "@qr-tracker/shared";

import { ApiError } from "../lib/api-error.js";
import { generateSecretKey, generateSlug, sha256Hex, timingSafeEqualHex } from "../lib/crypto.js";
import { log } from "../lib/log.js";
import { verifyTurnstile } from "../lib/turnstile.js";
import { checkUrlReputation } from "../lib/url-reputation.js";
import type { ReputationEnv } from "../lib/url-reputation.js";
import {
  deleteLinkWithScans,
  findLinkBySlug,
  findLinksBySlugs,
  insertLink,
  isUniqueConstraintError,
  effectiveStatus,
  toLink,
  updateLinkAsOwner,
} from "../repositories/links.js";
import type { LinkRow } from "../repositories/links.js";
import { fetchScanSummaries } from "../repositories/stats.js";

const MAX_SLUG_ATTEMPTS = 3;

/**
 * Validates a destination and returns its normalized absolute form. Always store this
 * form: a raw spelling like "https:/host/path" passes validation, but browsers resolve it
 * against the redirect's own URL when it is sent verbatim in Location.
 */
function normalizeTargetUrl(targetUrl: string, workerHostname: string): string {
  const result = validateTargetUrl(targetUrl, { blockedHosts: [workerHostname] });
  if (!result.ok) {
    throw new ApiError("TARGET_URL_INVALID", `Target URL rejected (${result.reason})`);
  }
  return result.url.href;
}

/** Rejects destinations Google Safe Browsing knows as phishing or malware. */
async function assertReputable(targetUrl: string, env: ReputationEnv): Promise<void> {
  if ((await checkUrlReputation(targetUrl, env)) === "malicious") {
    throw new ApiError("TARGET_URL_INVALID", "Target URL rejected (reputation)");
  }
}

export async function createLink(
  env: Env,
  requestUrl: URL,
  input: CreateLinkRequest,
): Promise<CreateLinkResponse> {
  const verified = await verifyTurnstile(env.TURNSTILE_SECRET_KEY, input.turnstileToken);
  if (!verified) throw new ApiError("TURNSTILE_FAILED", "Turnstile verification failed");

  const targetUrl = normalizeTargetUrl(input.targetUrl, requestUrl.hostname);
  await assertReputable(targetUrl, env);

  const secretKey = generateSecretKey();
  const secretHash = await sha256Hex(secretKey);
  const nowIso = new Date().toISOString();

  for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt++) {
    const slug = generateSlug();
    try {
      const row = await insertLink(
        env.DB,
        { slug, targetUrl, label: input.label ?? null, secretHash },
        nowIso,
      );
      log("link_created", { slug: row.slug });
      return { slug: row.slug, shortUrl: `${requestUrl.origin}/r/${row.slug}`, secretKey };
    } catch (error) {
      if (!isUniqueConstraintError(error) || attempt === MAX_SLUG_ATTEMPTS) throw error;
    }
  }
  throw new ApiError("INTERNAL", "Could not allocate a slug");
}

/** Constant-time check of a secret key against the stored hash. */
async function keyMatches(row: LinkRow, secretKey: string): Promise<boolean> {
  return timingSafeEqualHex(await sha256Hex(secretKey), row.secret_hash);
}

/** Loads a link and checks the caller's secret key (constant-time). */
export async function authorizeLink(
  db: D1Database,
  slug: string,
  secretKey: string,
): Promise<LinkRow> {
  const row = await findLinkBySlug(db, slug);
  if (row === null) throw new ApiError("NOT_FOUND", "Link not found");
  if (!(await keyMatches(row, secretKey))) {
    throw new ApiError("UNAUTHORIZED", "Invalid secret key");
  }
  return row;
}

/**
 * Status, scan count and last scan of each code in "My QR codes", in request order. Each
 * code is checked against its own key; a wrong key or a deleted link fails only that entry.
 */
export async function summarizeLinks(
  db: D1Database,
  items: LinkSummariesRequest["links"],
): Promise<LinkSummary[]> {
  const rows = await findLinksBySlugs(db, [...new Set(items.map((item) => item.slug))]);
  const bySlug = new Map(rows.map((row) => [row.slug, row]));
  const checked = await Promise.all(
    items.map(async ({ slug, secretKey }) => {
      const row = bySlug.get(slug);
      if (row === undefined) return { slug, error: "NOT_FOUND" as const };
      if (!(await keyMatches(row, secretKey))) return { slug, error: "UNAUTHORIZED" as const };
      return { slug, row };
    }),
  );
  const authorizedIds = checked.flatMap((entry) => ("row" in entry ? [entry.row.id] : []));
  const scans = await fetchScanSummaries(db, [...new Set(authorizedIds)]);
  return checked.map((entry): LinkSummary => {
    if (!("row" in entry)) return { ok: false, slug: entry.slug, error: entry.error };
    const summary = scans.get(entry.row.id);
    return {
      ok: true,
      slug: entry.slug,
      status: effectiveStatus(entry.row),
      scans: summary?.scans ?? 0,
      lastScanAt: summary?.last_scan ?? null,
    };
  });
}

export async function getLink(db: D1Database, slug: string, secretKey: string) {
  return toLink(await authorizeLink(db, slug, secretKey));
}

export async function updateLink(
  env: Env,
  slug: string,
  secretKey: string,
  patch: UpdateLinkRequest,
  workerHostname: string,
) {
  const db = env.DB;
  const row = await authorizeLink(db, slug, secretKey);
  if (effectiveStatus(row) === "blocked") {
    throw new ApiError("FORBIDDEN", "This link was blocked by the operator");
  }
  const targetUrl =
    patch.targetUrl === undefined ? undefined : normalizeTargetUrl(patch.targetUrl, workerHostname);
  // Re-checked on every retarget: otherwise a benign destination could be swapped for a
  // phishing page once the QR code is printed.
  if (targetUrl !== undefined) await assertReputable(targetUrl, env);
  const nowIso = new Date().toISOString();
  const applied = await updateLinkAsOwner(
    db,
    row.id,
    {
      ...(targetUrl !== undefined ? { targetUrl } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
    },
    nowIso,
  );
  // Blocked between the check above and the update: the guarded UPDATE changed nothing.
  if (!applied) throw new ApiError("FORBIDDEN", "This link was blocked by the operator");
  const updated = await findLinkBySlug(db, slug);
  if (updated === null) throw new ApiError("INTERNAL", "Link vanished during update");
  log("link_updated", { slug, statusChanged: patch.status !== undefined });
  return toLink(updated);
}

export async function deleteLink(db: D1Database, slug: string, secretKey: string): Promise<void> {
  const row = await authorizeLink(db, slug, secretKey);
  await deleteLinkWithScans(db, row.id);
  log("link_deleted", { slug });
}
