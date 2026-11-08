/** Start (epoch seconds) of the fixed window containing `nowMs`. */
export function windowStart(nowMs: number, windowSeconds: number): number {
  return Math.floor(nowMs / 1000 / windowSeconds) * windowSeconds;
}

/** Key of one rate-limit counter row. The identifier must already be hashed. */
export function rateLimitKey(scope: string, identifierHash: string, suffix?: string): string {
  return suffix === undefined
    ? `${scope}:${identifierHash}`
    : `${scope}:${identifierHash}:${suffix}`;
}

/** Parses env.RATE_LIMIT_MULTIPLIER: a whole number ≥ 1, else 1 (the configured limits). */
export function parseRateLimitMultiplier(raw: string | undefined): number {
  const parsed = raw === undefined ? Number.NaN : Number(raw);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
}

export function isOverLimit(count: number, limit: number): boolean {
  return count > limit;
}
