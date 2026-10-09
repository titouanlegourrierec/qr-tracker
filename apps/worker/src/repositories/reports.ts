import type { LinkStatus, ReportReason } from "@qr-tracker/shared";

export interface ReportListRow {
  id: number;
  slug: string;
  target_url: string;
  link_status: LinkStatus;
  reason: ReportReason;
  details: string | null;
  created_at: string;
}

export async function insertReport(
  db: D1Database,
  fields: { linkId: number; reason: ReportReason; details: string | null },
  nowIso: string,
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO abuse_reports (link_id, reason, details, created_at) VALUES (?1, ?2, ?3, ?4)",
    )
    .bind(fields.linkId, fields.reason, fields.details, nowIso)
    .run();
}

/** Newest reports first, with the reported link's current destination and status. */
export async function listReports(db: D1Database, limit: number): Promise<ReportListRow[]> {
  const result = await db
    .prepare(
      `SELECT r.id, l.slug, l.target_url,
              CASE WHEN l.blocked_at IS NULL THEN l.status ELSE 'blocked' END AS link_status,
              r.reason, r.details, r.created_at
       FROM abuse_reports r JOIN links l ON l.id = r.link_id
       ORDER BY r.created_at DESC, r.id DESC
       LIMIT ?1`,
    )
    .bind(limit)
    .all<ReportListRow>();
  return result.results;
}

export async function deleteReportsForLink(db: D1Database, linkId: number): Promise<number> {
  const result = await db
    .prepare("DELETE FROM abuse_reports WHERE link_id = ?1")
    .bind(linkId)
    .run();
  return result.meta.changes;
}

export async function deleteReportsBefore(db: D1Database, cutoffIso: string): Promise<number> {
  const result = await db
    .prepare("DELETE FROM abuse_reports WHERE created_at < ?1")
    .bind(cutoffIso)
    .run();
  return result.meta.changes;
}
