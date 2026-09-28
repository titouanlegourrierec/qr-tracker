import { errorBody } from "@qr-tracker/shared";
import { Hono } from "hono";

import { ApiError } from "./lib/api-error.js";
import { logError } from "./lib/log.js";
import { corsMiddleware } from "./middleware/cors.js";
import { securityHeaders } from "./middleware/security-headers.js";
import { linksRoutes } from "./routes/links.js";

export interface AppBindings {
  Bindings: Env;
}

export function createApp(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  app.use(securityHeaders());
  app.use("/api/*", corsMiddleware());

  app.get("/api/health", (c) => c.json({ ok: true }));
  app.route("/api/links", linksRoutes());

  app.notFound((c) => c.json(errorBody("NOT_FOUND", "Resource not found"), 404));

  app.onError((err, c) => {
    if (err instanceof ApiError) {
      return c.json(errorBody(err.code, err.message), err.status);
    }
    logError("unhandled_error", err, { path: c.req.path });
    return c.json(errorBody("INTERNAL", "Internal server error"), 500);
  });

  return app;
}
