import {
  createLinkRequestSchema,
  CSV_COLUMNS,
  EXPORT_MAX_ROWS,
  exportQuerySchema,
  slugSchema,
  statsQuerySchema,
  updateLinkRequestSchema,
} from "@qr-tracker/shared";
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";

import type { AppBindings } from "../app.js";
import { ApiError } from "../lib/api-error.js";
import { toCsv } from "../lib/csv.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { fetchScansForExport } from "../repositories/stats.js";
import { authorizeLink, createLink, deleteLink, getLink, updateLink } from "../services/links.js";
import { computeStats } from "../services/stats.js";

/** Parses the request body against a schema, mapping failures to VALIDATION_ERROR. */
async function parseBody<T>(c: Context<AppBindings>, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Request body must be JSON");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", z.prettifyError(parsed.error));
  return parsed.data;
}

/** Parses URL query params against a schema, mapping failures to VALIDATION_ERROR. */
function parseQuery<T>(c: Context<AppBindings>, schema: z.ZodType<T>): T {
  const params = Object.fromEntries(new URL(c.req.url).searchParams);
  const parsed = schema.safeParse(params);
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", z.prettifyError(parsed.error));
  return parsed.data;
}

function getSlugParam(c: Context<AppBindings>): string {
  const parsed = slugSchema.safeParse(c.req.param("slug"));
  if (!parsed.success) throw new ApiError("NOT_FOUND", "Link not found");
  return parsed.data;
}

/** Extracts the secret key from the Authorization: Bearer header. */
export function getBearerToken(c: Context<AppBindings>): string {
  const header = c.req.header("Authorization");
  const match = header === undefined ? null : /^Bearer\s+(\S+)$/.exec(header);
  if (match?.[1] === undefined) {
    throw new ApiError("UNAUTHORIZED", "Missing Authorization: Bearer <key> header");
  }
  return match[1];
}

const slugSuffix = (c: Context<AppBindings>): string => c.req.param("slug") ?? "";

export function linksRoutes(): Hono<AppBindings> {
  const routes = new Hono<AppBindings>();

  routes.post("/", rateLimit("createLink", { failOpen: false }), async (c) => {
    const body = await parseBody(c, createLinkRequestSchema);
    const created = await createLink(c.env, new URL(c.req.url), body);
    return c.json(created, 201);
  });

  routes.get(
    "/:slug",
    rateLimit("authenticated", { failOpen: true, keySuffix: slugSuffix }),
    async (c) => {
      const link = await getLink(c.env.DB, getSlugParam(c), getBearerToken(c));
      return c.json(link);
    },
  );

  routes.get(
    "/:slug/stats",
    rateLimit("authenticated", { failOpen: true, keySuffix: slugSuffix }),
    async (c) => {
      const query = parseQuery(c, statsQuerySchema);
      const link = await authorizeLink(c.env.DB, getSlugParam(c), getBearerToken(c));
      const stats = await computeStats(c.env.DB, link, query);
      return c.json(stats);
    },
  );

  routes.get(
    "/:slug/export",
    rateLimit("authenticated", { failOpen: true, keySuffix: slugSuffix }),
    async (c) => {
      const query = parseQuery(c, exportQuerySchema);
      const slug = getSlugParam(c);
      const link = await authorizeLink(c.env.DB, slug, getBearerToken(c));
      // Export filters use UTC day boundaries (raw rows are UTC timestamps).
      const rows = await fetchScansForExport(
        c.env.DB,
        link.id,
        {
          ...(query.from !== undefined ? { startIso: `${query.from}T00:00:00.000Z` } : {}),
          ...(query.to !== undefined ? { endIso: `${query.to}T23:59:59.999Z` } : {}),
        },
        query.includeBots,
        EXPORT_MAX_ROWS,
      );
      return c.body(toCsv(CSV_COLUMNS, rows), 200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="qr-${slug}-scans.csv"`,
      });
    },
  );

  routes.patch(
    "/:slug",
    rateLimit("authenticated", { failOpen: false, keySuffix: slugSuffix }),
    async (c) => {
      const body = await parseBody(c, updateLinkRequestSchema);
      const link = await updateLink(
        c.env.DB,
        getSlugParam(c),
        getBearerToken(c),
        body,
        new URL(c.req.url).hostname,
      );
      return c.json(link);
    },
  );

  routes.delete(
    "/:slug",
    rateLimit("authenticated", { failOpen: false, keySuffix: slugSuffix }),
    async (c) => {
      await deleteLink(c.env.DB, getSlugParam(c), getBearerToken(c));
      return c.body(null, 204);
    },
  );

  return routes;
}
