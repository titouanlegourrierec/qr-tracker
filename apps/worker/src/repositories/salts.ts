import { generateSalt } from "../lib/crypto.js";

/**
 * Returns the salt for the given UTC day ('YYYY-MM-DD'), creating it on first
 * use. INSERT OR IGNORE + re-SELECT makes concurrent first scans race-safe.
 */
export async function getOrCreateDailySalt(db: D1Database, day: string): Promise<string> {
  const existing = await db
    .prepare("SELECT salt FROM salts WHERE day = ?1")
    .bind(day)
    .first<{ salt: string }>();
  if (existing !== null) return existing.salt;

  await db
    .prepare("INSERT OR IGNORE INTO salts (day, salt) VALUES (?1, ?2)")
    .bind(day, generateSalt())
    .run();

  const row = await db
    .prepare("SELECT salt FROM salts WHERE day = ?1")
    .bind(day)
    .first<{ salt: string }>();
  if (row === null) throw new Error("Failed to create daily salt");
  return row.salt;
}

/** Deletes salts for days strictly before `keepFromDay` (cron). */
export async function deleteSaltsBefore(db: D1Database, keepFromDay: string): Promise<number> {
  const result = await db.prepare("DELETE FROM salts WHERE day < ?1").bind(keepFromDay).run();
  return result.meta.changes;
}
