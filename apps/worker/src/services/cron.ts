import { DEFAULT_RETENTION_DAYS } from "@qr-tracker/shared";

import { log } from "../lib/log.js";
import { deleteRateLimitWindowsBefore } from "../repositories/rate-limits.js";
import { deleteReportsBefore } from "../repositories/reports.js";
import { getOrCreateDailySalt, deleteSaltsBefore } from "../repositories/salts.js";
import { deleteScansBefore } from "../repositories/scans.js";

/** Parses env.RETENTION_DAYS, falling back to the default on garbage. */
export function parseRetentionDays(raw: string | undefined): number {
  const parsed = raw === undefined ? Number.NaN : Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_RETENTION_DAYS;
}

export interface MaintenanceReport {
  saltsDeleted: number;
  scansPurged: number;
  reportsPurged: number;
  rateWindowsDeleted: number;
}

/**
 * Daily maintenance (cron, just after midnight UTC): rotate the salt (create today's,
 * drop every older one), purge scans and abuse reports past retention, drop expired
 * rate-limit windows.
 */
export async function runDailyMaintenance(env: Env, now = new Date()): Promise<MaintenanceReport> {
  const today = now.toISOString().slice(0, 10);
  await getOrCreateDailySalt(env.DB, today);
  // Only today's salt is ever read (scans and the rate limiter use the current UTC day).
  // Deleting the others right away makes yesterday's hashes irreversible: with the cron
  // at 00:05 UTC, a salt lives about 24 hours, as the privacy page promises.
  const saltsDeleted = await deleteSaltsBefore(env.DB, today);

  const retentionDays = parseRetentionDays(env.RETENTION_DAYS);
  const cutoffIso = new Date(now.getTime() - retentionDays * 86_400_000).toISOString();
  const scansPurged = await deleteScansBefore(env.DB, cutoffIso);
  const reportsPurged = await deleteReportsBefore(env.DB, cutoffIso);

  const rateWindowsDeleted = await deleteRateLimitWindowsBefore(
    env.DB,
    Math.floor(now.getTime() / 1000) - 86_400,
  );

  const report = { saltsDeleted, scansPurged, reportsPurged, rateWindowsDeleted };
  log("cron_completed", { ...report, retentionDays });
  return report;
}
