import { Hono } from "hono";

import type { AppBindings } from "../app.js";
import { DISABLED_PAGE, NOT_FOUND_PAGE } from "../i18n/error-pages.js";
import { logError } from "../lib/log.js";
import { findLinkBySlug } from "../repositories/links.js";
import { recordScan } from "../services/scans.js";
import type { ScanContext } from "../services/scans.js";

function cfString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/** Extracts the scan context from the incoming request (values only, no storage). */
export function scanContextFromRequest(req: Request): ScanContext {
  // request.cf is only guaranteed on real inbound requests; read it defensively.
  const cf: Record<string, unknown> = req.cf ?? {};
  return {
    ip: req.headers.get("CF-Connecting-IP") ?? "unknown",
    userAgent: req.headers.get("User-Agent"),
    acceptLanguage: req.headers.get("Accept-Language"),
    country: cfString(cf.country),
    region: cfString(cf.region),
    city: cfString(cf.city),
    timezone: cfString(cf.timezone),
    asOrganization: cfString(cf.asOrganization),
  };
}

export function redirectRoutes(): Hono<AppBindings> {
  const routes = new Hono<AppBindings>();

  routes.get("/:slug", async (c) => {
    const slug = c.req.param("slug");
    const link = await findLinkBySlug(c.env.DB, slug);

    if (link === null) {
      return c.html(NOT_FOUND_PAGE, 404);
    }
    if (link.status !== "active") {
      // Covers both owner-disabled and admin-blocked links.
      return c.html(DISABLED_PAGE, 410);
    }

    // Record the scan after responding; a tracking failure must never break the redirect.
    const context = scanContextFromRequest(c.req.raw);
    c.executionCtx.waitUntil(
      recordScan(c.env.DB, { id: link.id, slug: link.slug }, context).catch((error: unknown) => {
        logError("scan_record_failed", error, { slug: link.slug });
      }),
    );

    return c.body(null, 302, {
      Location: link.target_url,
      "Cache-Control": "no-store",
    });
  });

  return routes;
}
