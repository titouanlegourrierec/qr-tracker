import { log } from "./log.js";

export type ReputationVerdict = "ok" | "malicious" | "unknown";

/**
 * Optional destination-reputation check, behind the URL_REPUTATION_ENABLED
 * flag (default off). No provider is wired on the free tier; this is the
 * documented integration point (see docs/adr/) — e.g. Google Safe Browsing
 * would slot in here. "unknown" never blocks creation.
 */
export async function checkUrlReputation(
  targetUrl: string,
  // Widened to string: wrangler types the var as its config literal ("false").
  env: { URL_REPUTATION_ENABLED: string },
): Promise<ReputationVerdict> {
  if (env.URL_REPUTATION_ENABLED !== "true") return "ok";
  log("url_reputation_skipped", {
    reason: "no provider configured",
    host: new URL(targetUrl).hostname,
  });
  return await Promise.resolve("unknown");
}
