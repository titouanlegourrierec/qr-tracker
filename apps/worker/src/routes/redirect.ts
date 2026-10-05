import { Hono } from "hono";

import type { AppBindings } from "../app.js";
import { DISABLED_PAGE, NOT_FOUND_PAGE, UNAVAILABLE_PAGE } from "../i18n/error-pages.js";
import { logError } from "../lib/log.js";
import { lookupLinkForRedirect } from "../services/redirect.js";
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
    const lookup = await lookupLinkForRedirect(c.env.DB, c.req.param("slug"));

    // Every answer is no-store: a link's state can change at any time, and Chromium
    // would otherwise keep a header-less 410 forever (it treats 410 as implicitly fresh).
    if (lookup.kind === "unavailable") {
      return c.html(UNAVAILABLE_PAGE, 503, { "Cache-Control": "no-store", "Retry-After": "300" });
    }
    if (lookup.kind === "missing") {
      return c.html(NOT_FOUND_PAGE, 404, { "Cache-Control": "no-store" });
    }
    const { link, fromCache } = lookup;
    if (link.status !== "active") {
      // Covers both owner-disabled and admin-blocked links.
      return c.html(DISABLED_PAGE, 410, { "Cache-Control": "no-store" });
    }

    // Record the scan after responding; a tracking failure must never break the redirect.
    // A cached answer means D1 is failing, so recording would only fail too.
    if (!fromCache) {
      const context = scanContextFromRequest(c.req.raw);
      c.executionCtx.waitUntil(
        recordScan(c.env.DB, { id: link.id, slug: link.slug }, context).catch((error: unknown) => {
          logError("scan_record_failed", error, { slug: link.slug });
        }),
      );
    }

    return c.body(null, 302, {
      // Rows written before destinations were normalized hold the raw input (e.g.
      // "https:/host"), which browsers would resolve against this worker's own URL.
      Location: new URL(link.target_url).href,
      "Cache-Control": "no-store",
    });
  });

  return routes;
}
