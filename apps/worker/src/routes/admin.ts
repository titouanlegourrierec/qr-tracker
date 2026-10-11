import { adminStatusRequestSchema, errorBody } from "@qr-tracker/shared";
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";

import type { AppBindings } from "../app.js";
import { ApiError } from "../lib/api-error.js";
import { sha256Hex, timingSafeEqualHex } from "../lib/crypto.js";
import { log } from "../lib/log.js";
import { findLinkBySlug, setLinkBlocked, toLink } from "../repositories/links.js";
import { deleteReportsForLink, listReports } from "../repositories/reports.js";

import { getBearerToken } from "./links.js";

async function assertAdmin(c: Context<AppBindings>): Promise<void> {
  const token = getBearerToken(c);
  const [provided, expected] = await Promise.all([sha256Hex(token), sha256Hex(c.env.ADMIN_TOKEN)]);
  if (c.env.ADMIN_TOKEN === "" || !timingSafeEqualHex(provided, expected)) {
    throw new ApiError("UNAUTHORIZED", "Invalid admin token");
  }
}

const REPORTS_DEFAULT_LIMIT = 100;
const reportsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(REPORTS_DEFAULT_LIMIT),
});

/**
 * Operator endpoints (see scripts/admin.mjs): the kill switch that disables/re-enables any
 * slug, and the abuse-report queue.
 */
export function adminRoutes(): Hono<AppBindings> {
  const routes = new Hono<AppBindings>();

  routes.post("/links/:slug/status", async (c) => {
    await assertAdmin(c);
    const parsed = adminStatusRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) throw new ApiError("VALIDATION_ERROR", z.prettifyError(parsed.error));

    const slug = c.req.param("slug");
    const row = await findLinkBySlug(c.env.DB, slug);
    if (row === null) return c.json(errorBody("NOT_FOUND", "Link not found"), 404);

    // "active" lifts the block; the owner's own active/disabled choice is restored.
    await setLinkBlocked(
      c.env.DB,
      row.id,
      parsed.data.status === "blocked",
      new Date().toISOString(),
    );
    log("admin_status_change", { slug, status: parsed.data.status });
    const updated = await findLinkBySlug(c.env.DB, slug);
    if (updated === null) throw new ApiError("INTERNAL", "Link vanished during update");
    return c.json(toLink(updated, "owner"));
  });

  routes.get("/reports", async (c) => {
    await assertAdmin(c);
    const parsed = reportsQuerySchema.safeParse(
      Object.fromEntries(new URL(c.req.url).searchParams),
    );
    if (!parsed.success) throw new ApiError("VALIDATION_ERROR", z.prettifyError(parsed.error));
    const rows = await listReports(c.env.DB, parsed.data.limit);
    return c.json({
      reports: rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        targetUrl: row.target_url,
        linkStatus: row.link_status,
        reason: row.reason,
        details: row.details,
        createdAt: row.created_at,
      })),
    });
  });

  /** Dismisses (deletes) every report of a link once it has been handled. */
  routes.delete("/links/:slug/reports", async (c) => {
    await assertAdmin(c);
    const slug = c.req.param("slug");
    const row = await findLinkBySlug(c.env.DB, slug);
    if (row === null) return c.json(errorBody("NOT_FOUND", "Link not found"), 404);
    const dismissed = await deleteReportsForLink(c.env.DB, row.id);
    log("admin_reports_dismissed", { slug, dismissed });
    return c.json({ dismissed });
  });

  return routes;
}
