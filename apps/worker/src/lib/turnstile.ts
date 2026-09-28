import { z } from "zod";

import { logError } from "./log.js";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const siteverifyResponseSchema = z.object({ success: z.boolean() });

/**
 * Server-side Turnstile verification. Any failure (bad token, non-200, network
 * error, unexpected body) counts as "not verified" — creation is fail-closed.
 */
export async function verifyTurnstile(
  secretKey: string,
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const body = new URLSearchParams({ secret: secretKey, response: token });
    const res = await fetchFn(SITEVERIFY_URL, { method: "POST", body });
    if (!res.ok) return false;
    const parsed = siteverifyResponseSchema.safeParse(await res.json());
    return parsed.success && parsed.data.success;
  } catch (error) {
    logError("turnstile_verify_error", error);
    return false;
  }
}
