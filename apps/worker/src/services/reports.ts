import type { CreateReportRequest } from "@qr-tracker/shared";

import { ApiError } from "../lib/api-error.js";
import { log } from "../lib/log.js";
import { verifyTurnstile } from "../lib/turnstile.js";
import { findLinkBySlug } from "../repositories/links.js";
import { insertReport } from "../repositories/reports.js";

/** Stores an abuse report for an existing link. The operator reviews them (scripts/admin.mjs). */
export async function createReport(env: Env, input: CreateReportRequest): Promise<void> {
  const verified = await verifyTurnstile(env.TURNSTILE_SECRET_KEY, input.turnstileToken);
  if (!verified) throw new ApiError("TURNSTILE_FAILED", "Turnstile verification failed");

  const link = await findLinkBySlug(env.DB, input.slug);
  if (link === null) throw new ApiError("NOT_FOUND", "Link not found");

  const details = input.details === undefined || input.details === "" ? null : input.details;
  await insertReport(
    env.DB,
    { linkId: link.id, reason: input.reason, details },
    new Date().toISOString(),
  );
  // The free-text details may contain personal data: never logged.
  log("abuse_report_received", { slug: link.slug, reason: input.reason });
}
