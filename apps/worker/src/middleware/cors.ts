import type { MiddlewareHandler } from "hono";

import type { AppBindings } from "../app.js";

const ALLOW_METHODS = "GET,POST,PATCH,DELETE,OPTIONS";
const ALLOW_HEADERS = "Content-Type, Authorization";

/**
 * CORS restricted to the origins listed in env.ALLOWED_ORIGINS (comma-separated).
 * Hand-rolled instead of hono/cors because the allowlist comes from env, which
 * hono/cors can only reach through an untyped context.
 */
export function corsMiddleware(): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    const allowed = c.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim());
    const origin = c.req.header("Origin");
    const allowOrigin = origin !== undefined && allowed.includes(origin) ? origin : null;

    if (c.req.method === "OPTIONS") {
      const headers = new Headers({ Vary: "Origin" });
      if (allowOrigin !== null) {
        headers.set("Access-Control-Allow-Origin", allowOrigin);
        headers.set("Access-Control-Allow-Methods", ALLOW_METHODS);
        headers.set("Access-Control-Allow-Headers", ALLOW_HEADERS);
        headers.set("Access-Control-Max-Age", "86400");
      }
      return new Response(null, { status: 204, headers });
    }

    await next();
    c.header("Vary", "Origin");
    if (allowOrigin !== null) {
      c.header("Access-Control-Allow-Origin", allowOrigin);
    }
  };
}
