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

export function isOverLimit(count: number, limit: number): boolean {
  return count > limit;
}
