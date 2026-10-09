import { LinkCache } from "../lib/link-cache.js";
import type { RedirectLink } from "../lib/link-cache.js";
import { logError } from "../lib/log.js";
import { effectiveStatus, findLinkBySlug } from "../repositories/links.js";

const LINK_CACHE_MAX_ENTRIES = 1_000;
const LINK_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// Module scope = one cache per isolate, shared by the requests it serves.
const linkCache = new LinkCache(LINK_CACHE_MAX_ENTRIES, LINK_CACHE_MAX_AGE_MS);

export type LinkLookup =
  | { kind: "found"; link: RedirectLink; fromCache: boolean }
  | { kind: "missing" }
  | { kind: "unavailable" };

/**
 * Resolves a slug for the redirect. D1 is always asked first; if it fails, the last
 * state this isolate saw is used so the QR code keeps working (see LinkCache).
 */
export async function lookupLinkForRedirect(db: D1Database, slug: string): Promise<LinkLookup> {
  try {
    const row = await findLinkBySlug(db, slug);
    if (row === null) {
      linkCache.forget(slug);
      return { kind: "missing" };
    }
    const link: RedirectLink = {
      id: row.id,
      slug: row.slug,
      target_url: row.target_url,
      status: effectiveStatus(row),
    };
    linkCache.remember(link);
    return { kind: "found", link, fromCache: false };
  } catch (error) {
    const cached = linkCache.recall(slug);
    logError("link_lookup_failed", error, { slug, servedFromCache: cached !== null });
    return cached === null
      ? { kind: "unavailable" }
      : { kind: "found", link: cached, fromCache: true };
  }
}
