import type { Link, LinkStatus } from "@qr-tracker/shared";

export interface LinkRow {
  id: number;
  slug: string;
  target_url: string;
  label: string | null;
  secret_hash: string;
  status: LinkStatus;
  created_at: string;
  updated_at: string;
}

export function toLink(row: LinkRow): Link {
  return {
    slug: row.slug,
    targetUrl: row.target_url,
    label: row.label,
    status: row.status,
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

export async function updateLinkRow(
  db: D1Database,
  id: number,
  patch: { targetUrl?: string; status?: LinkStatus },
  nowIso: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE links
       SET target_url = COALESCE(?1, target_url),
           status = COALESCE(?2, status),
           updated_at = ?3
       WHERE id = ?4`,
    )
    .bind(patch.targetUrl ?? null, patch.status ?? null, nowIso, id)
    .run();
}

/** Deletes a link and all of its scans atomically (D1 batches are transactional). */
export async function deleteLinkWithScans(db: D1Database, id: number): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM scans WHERE link_id = ?1").bind(id),
    db.prepare("DELETE FROM links WHERE id = ?1").bind(id),
  ]);
}
