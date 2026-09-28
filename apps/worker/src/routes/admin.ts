import { adminStatusRequestSchema, errorBody } from "@qr-tracker/shared";
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";

import type { AppBindings } from "../app.js";
import { ApiError } from "../lib/api-error.js";
import { sha256Hex, timingSafeEqualHex } from "../lib/crypto.js";
import { log } from "../lib/log.js";
import { findLinkBySlug, toLink, updateLinkRow } from "../repositories/links.js";

import { getBearerToken } from "./links.js";

async function assertAdmin(c: Context<AppBindings>): Promise<void> {
  const token = getBearerToken(c);
  const [provided, expected] = await Promise.all([sha256Hex(token), sha256Hex(c.env.ADMIN_TOKEN)]);
  if (c.env.ADMIN_TOKEN === "" || !timingSafeEqualHex(provided, expected)) {
    throw new ApiError("UNAUTHORIZED", "Invalid admin token");
  }
}

/** Kill switch: lets the operator disable/re-enable any slug (see scripts/admin.mjs). */
export function adminRoutes(): Hono<AppBindings> {
  const routes = new Hono<AppBindings>();

  routes.post("/links/:slug/status", async (c) => {
    await assertAdmin(c);
    const parsed = adminStatusRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) throw new ApiError("VALIDATION_ERROR", z.prettifyError(parsed.error));

    const slug = c.req.param("slug");
    const row = await findLinkBySlug(c.env.DB, slug);
    if (row === null) return c.json(errorBody("NOT_FOUND", "Link not found"), 404);

    await updateLinkRow(c.env.DB, row.id, { status: parsed.data.status }, new Date().toISOString());
    log("admin_status_change", { slug, status: parsed.data.status });
    const updated = await findLinkBySlug(c.env.DB, slug);
    if (updated === null) throw new ApiError("INTERNAL", "Link vanished during update");
    return c.json(toLink(updated));
  });

  return routes;
}
