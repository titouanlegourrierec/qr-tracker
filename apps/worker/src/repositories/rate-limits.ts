/** Atomically increments the counter for (key, window) and returns the new count. */
export async function incrementRateLimit(
  db: D1Database,
  key: string,
  windowStartSeconds: number,
): Promise<number> {
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
       ON CONFLICT (key, window_start) DO UPDATE SET count = count + 1
       RETURNING count`,
    )
    .bind(key, windowStartSeconds)
    .first<{ count: number }>();
  if (row === null) throw new Error("Rate limit upsert returned no row");
  return row.count;
}

/** Deletes windows that started before the given epoch-seconds cutoff (cron). */
export async function deleteRateLimitWindowsBefore(
  db: D1Database,
  cutoffSeconds: number,
): Promise<number> {
  const result = await db
    .prepare("DELETE FROM rate_limits WHERE window_start < ?1")
    .bind(cutoffSeconds)
    .run();
  return result.meta.changes;
}
