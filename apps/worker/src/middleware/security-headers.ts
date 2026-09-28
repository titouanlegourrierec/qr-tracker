import type { MiddlewareHandler } from "hono";

/** Security headers applied to every worker response. */
export function securityHeaders(): MiddlewareHandler {
  return async (c, next) => {
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "no-referrer");
    c.header("X-Frame-Options", "DENY");
    c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    c.header("Cross-Origin-Opener-Policy", "same-origin");
    // JSON/redirect responses need no scripts; HTML error pages inline their minimal CSS.
    if (c.res.headers.get("Content-Type")?.includes("text/html")) {
      c.header(
        "Content-Security-Policy",
        "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
      );
    }
  };
}
