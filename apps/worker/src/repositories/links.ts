import type { Link, LinkStatus } from "@qr-tracker/shared";

export interface LinkRow {
  id: number;
  slug: string;
  target_url: string;
  label: string | null;
  secret_hash: string;
  /** The owner's choice only (active/disabled); operator blocks live in blocked_at. */
  status: LinkStatus;
  /** Set while the operator blocks the link (admin kill switch), null otherwise. */
  blocked_at: string | null;
  created_at: string;
  updated_at: string;
}

/** What the link does now: an operator block overrides the owner's choice. */
export function effectiveStatus(row: Pick<LinkRow, "status" | "blocked_at">): LinkStatus {
  return row.blocked_at === null ? row.status : "blocked";
}

export function toLink(row: LinkRow): Link {
  return {
    slug: row.slug,
    targetUrl: row.target_url,
    label: row.label,
    status: effectiveStatus(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** True when the error is SQLite's UNIQUE constraint violation (slug collision). */
export function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("UNIQUE constraint failed");
}

export async function insertLink(
  db: D1Database,
  fields: { slug: string; targetUrl: string; label: string | null; secretHash: string },
  nowIso: string,
): Promise<LinkRow> {
  const row = await db
    .prepare(
      `INSERT INTO links (slug, target_url, label, secret_hash, status, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, 'active', ?5, ?5)
       RETURNING *`,
    )
    .bind(fields.slug, fields.targetUrl, fields.label, fields.secretHash, nowIso)
    .first<LinkRow>();
  if (row === null) throw new Error("Link insert returned no row");
  return row;
}

export async function findLinkBySlug(db: D1Database, slug: string): Promise<LinkRow | null> {
  return db.prepare("SELECT * FROM links WHERE slug = ?1").bind(slug).first<LinkRow>();
}

/**
 * Owner update. Returns false when the link is blocked: the check is part of the UPDATE,
 * so an owner request racing an operator block cannot undo it.
 */
export async function updateLinkAsOwner(
  db: D1Database,
  id: number,
  patch: { targetUrl?: string; status?: "active" | "disabled" },
  nowIso: string,
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE links
       SET target_url = COALESCE(?1, target_url),
           status = COALESCE(?2, status),
           updated_at = ?3
       WHERE id = ?4 AND blocked_at IS NULL`,
    )
    .bind(patch.targetUrl ?? null, patch.status ?? null, nowIso, id)
    .run();
  return result.meta.changes > 0;
}

/** Operator kill switch. Never touches the owner's status, so unblocking restores it. */
export async function setLinkBlocked(
  db: D1Database,
  id: number,
  blocked: boolean,
  nowIso: string,
): Promise<void> {
  const sql = blocked
    ? "UPDATE links SET blocked_at = COALESCE(blocked_at, ?1), updated_at = ?1 WHERE id = ?2"
    : "UPDATE links SET blocked_at = NULL, updated_at = ?1 WHERE id = ?2";
  await db.prepare(sql).bind(nowIso, id).run();
}

/** Deletes a link with its scans and abuse reports atomically (D1 batches are transactional). */
export async function deleteLinkWithScans(db: D1Database, id: number): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM scans WHERE link_id = ?1").bind(id),
    db.prepare("DELETE FROM abuse_reports WHERE link_id = ?1").bind(id),
    db.prepare("DELETE FROM links WHERE id = ?1").bind(id),
  ]);
}
