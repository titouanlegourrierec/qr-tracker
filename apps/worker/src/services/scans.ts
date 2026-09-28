import { isBotUserAgent } from "../lib/bot-detect.js";
import { parsePrimaryLanguage } from "../lib/language.js";
import { log } from "../lib/log.js";
import { parseUserAgent } from "../lib/user-agent.js";
import { computeVisitorHash } from "../lib/visitor-hash.js";
import { getOrCreateDailySalt } from "../repositories/salts.js";
import { insertScan } from "../repositories/scans.js";

/** Request data needed to record a scan — extracted in the route, never stored raw. */
export interface ScanContext {
  ip: string;
  userAgent: string | null;
  acceptLanguage: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  timezone: string | null;
  asOrganization: string | null;
}

/**
 * Records one scan. Raw IP and user-agent only ever live in this function's
 * scope: they are reduced to a salted hash and coarse families before insert.
 */
export async function recordScan(
  db: D1Database,
  link: { id: number; slug: string },
  context: ScanContext,
): Promise<void> {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const salt = await getOrCreateDailySalt(db, day);
  const visitorHash = await computeVisitorHash(
    salt,
    link.slug,
    context.ip,
    context.userAgent ?? "",
  );
  const { deviceType, os, browser } = parseUserAgent(context.userAgent);

  await insertScan(db, {
    linkId: link.id,
    scannedAt: now.toISOString(),
    country: context.country,
    region: context.region,
    city: context.city,
    timezone: context.timezone,
    asOrganization: context.asOrganization,
    deviceType,
    os,
    browser,
    language: parsePrimaryLanguage(context.acceptLanguage),
    isBot: isBotUserAgent(context.userAgent),
    visitorHash,
  });
  log("scan_recorded", { slug: link.slug });
}
