import { validateTargetUrl } from "@qr-tracker/shared";
import type { CreateLinkRequest, CreateLinkResponse, UpdateLinkRequest } from "@qr-tracker/shared";

import { ApiError } from "../lib/api-error.js";
import { generateSecretKey, generateSlug, sha256Hex, timingSafeEqualHex } from "../lib/crypto.js";
import { log } from "../lib/log.js";
import { verifyTurnstile } from "../lib/turnstile.js";
import { checkUrlReputation } from "../lib/url-reputation.js";
import {
  deleteLinkWithScans,
  findLinkBySlug,
  insertLink,
  isUniqueConstraintError,
  toLink,
  updateLinkRow,
} from "../repositories/links.js";
import type { LinkRow } from "../repositories/links.js";

const MAX_SLUG_ATTEMPTS = 3;

function assertValidTargetUrl(targetUrl: string, workerHostname: string): void {
  const result = validateTargetUrl(targetUrl, { blockedHosts: [workerHostname] });
  if (!result.ok) {
    throw new ApiError("TARGET_URL_INVALID", `Target URL rejected (${result.reason})`);
  }
}

export async function createLink(
  env: Env,
  requestUrl: URL,
  input: CreateLinkRequest,
): Promise<CreateLinkResponse> {
  const verified = await verifyTurnstile(env.TURNSTILE_SECRET_KEY, input.turnstileToken);
  if (!verified) throw new ApiError("TURNSTILE_FAILED", "Turnstile verification failed");

  assertValidTargetUrl(input.targetUrl, requestUrl.hostname);
  if ((await checkUrlReputation(input.targetUrl, env)) === "malicious") {
    throw new ApiError("TARGET_URL_INVALID", "Target URL rejected (reputation)");
  }

  const secretKey = generateSecretKey();
  const secretHash = await sha256Hex(secretKey);
  const nowIso = new Date().toISOString();

  for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt++) {
    const slug = generateSlug();
    try {
      const row = await insertLink(
        env.DB,
        { slug, targetUrl: input.targetUrl, label: input.label ?? null, secretHash },
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

/** Loads a link and checks the caller's secret key (constant-time). */
export async function authorizeLink(
  db: D1Database,
  slug: string,
  secretKey: string,
): Promise<LinkRow> {
  const row = await findLinkBySlug(db, slug);
  if (row === null) throw new ApiError("NOT_FOUND", "Link not found");
  const providedHash = await sha256Hex(secretKey);
  if (!timingSafeEqualHex(providedHash, row.secret_hash)) {
    throw new ApiError("UNAUTHORIZED", "Invalid secret key");
  }
  return row;
}

export async function getLink(db: D1Database, slug: string, secretKey: string) {
  return toLink(await authorizeLink(db, slug, secretKey));
}

export async function updateLink(
  db: D1Database,
  slug: string,
  secretKey: string,
  patch: UpdateLinkRequest,
  workerHostname: string,
) {
  const row = await authorizeLink(db, slug, secretKey);
  if (row.status === "blocked") {
    throw new ApiError("FORBIDDEN", "This link was blocked by the operator");
  }
  if (patch.targetUrl !== undefined) assertValidTargetUrl(patch.targetUrl, workerHostname);
  const nowIso = new Date().toISOString();
  await updateLinkRow(
    db,
    row.id,
    {
      ...(patch.targetUrl !== undefined ? { targetUrl: patch.targetUrl } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
    },
    nowIso,
  );
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
