import { z } from "zod";

import { log, logError } from "./log.js";

export type ReputationVerdict = "ok" | "malicious" | "unknown";

export interface ReputationEnv {
  // Widened to string: wrangler types the var as its config literal.
  URL_REPUTATION_ENABLED: string;
  /** Optional secret; the check is skipped while it is unset. */
  SAFE_BROWSING_API_KEY?: string;
}

const LOOKUP_URL = "https://safebrowsing.googleapis.com/v4/threatMatches:find";
const LOOKUP_TIMEOUT_MS = 3000;

const lookupResponseSchema = z.object({
  matches: z.array(z.object({ threatType: z.string() })).optional(),
});

/**
 * Checks a destination against the Google Safe Browsing Lookup API (v4) before a link is
 * created or retargeted. Fail-open by design: a disabled check, a missing API key or any
 * API failure yields "unknown", which never blocks — only a positive match does.
 * The URL is the only data sent; no information about the user is.
 */
export async function checkUrlReputation(
  targetUrl: string,
  env: ReputationEnv,
  fetchFn: typeof fetch = fetch,
): Promise<ReputationVerdict> {
  if (env.URL_REPUTATION_ENABLED !== "true") return "ok";
  const apiKey = env.SAFE_BROWSING_API_KEY ?? "";
  if (apiKey === "") {
    log("url_reputation_skipped", { reason: "SAFE_BROWSING_API_KEY not set" });
    return "unknown";
  }

  try {
    const res = await fetchFn(`${LOOKUP_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client: { clientId: "qr-tracker", clientVersion: "1" },
        threatInfo: {
          threatTypes: [
            "MALWARE",
            "SOCIAL_ENGINEERING",
            "UNWANTED_SOFTWARE",
            "POTENTIALLY_HARMFUL_APPLICATION",
          ],
          platformTypes: ["ANY_PLATFORM"],
          threatEntryTypes: ["URL"],
          threatEntries: [{ url: targetUrl }],
        },
      }),
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Safe Browsing answered HTTP ${res.status}`);
    const parsed = lookupResponseSchema.safeParse(await res.json());
    if (!parsed.success) throw new Error("Unexpected Safe Browsing response");
    const matches = parsed.data.matches ?? [];
    if (matches.length === 0) return "ok";
    log("url_reputation_match", {
      host: new URL(targetUrl).hostname,
      threats: [...new Set(matches.map((m) => m.threatType))],
    });
    return "malicious";
  } catch (error) {
    logError("url_reputation_failed", error);
    return "unknown";
  }
}
