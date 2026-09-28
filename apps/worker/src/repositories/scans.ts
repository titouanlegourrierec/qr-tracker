import type { DeviceType } from "@qr-tracker/shared";

export interface ScanFields {
  linkId: number;
  scannedAt: string;
  country: string | null;
  region: string | null;
  city: string | null;
  timezone: string | null;
  asOrganization: string | null;
  deviceType: DeviceType;
  os: string | null;
  browser: string | null;
  language: string | null;
  isBot: boolean;
  visitorHash: string;
}

/** Purges scans older than the retention cutoff (cron). */
export async function deleteScansBefore(db: D1Database, cutoffIso: string): Promise<number> {
  const result = await db.prepare("DELETE FROM scans WHERE scanned_at < ?1").bind(cutoffIso).run();
  return result.meta.changes;
}

export async function insertScan(db: D1Database, scan: ScanFields): Promise<void> {
  await db
    .prepare(
      `INSERT INTO scans (link_id, scanned_at, country, region, city, timezone,
                          as_organization, device_type, os, browser, language, is_bot, visitor_hash)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`,
    )
    .bind(
      scan.linkId,
      scan.scannedAt,
      scan.country,
      scan.region,
      scan.city,
      scan.timezone,
      scan.asOrganization,
      scan.deviceType,
      scan.os,
      scan.browser,
      scan.language,
      scan.isBot ? 1 : 0,
      scan.visitorHash,
    )
    .run();
}
