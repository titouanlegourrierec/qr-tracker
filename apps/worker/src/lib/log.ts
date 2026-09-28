/**
 * Structured JSON logging. Callers must never pass personal data
 * (raw IPs, user agents, target URLs of third parties…).
 */
export function log(event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ time: new Date().toISOString(), event, ...fields }));
}

export function logError(
  event: string,
  error: unknown,
  fields: Record<string, unknown> = {},
): void {
  const detail =
    error instanceof Error
      ? { error: error.message, stack: error.stack }
      : { error: String(error) };
  console.error(JSON.stringify({ time: new Date().toISOString(), event, ...detail, ...fields }));
}
