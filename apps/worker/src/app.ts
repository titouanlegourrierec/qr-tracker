import { errorBody } from "@qr-tracker/shared";
import { Hono } from "hono";

import { ApiError } from "./lib/api-error.js";
import { logError } from "./lib/log.js";
import { corsMiddleware } from "./middleware/cors.js";
import { securityHeaders } from "./middleware/security-headers.js";
import { adminRoutes } from "./routes/admin.js";
import { linksRoutes } from "./routes/links.js";
import { redirectRoutes } from "./routes/redirect.js";
import { reportsRoutes } from "./routes/reports.js";

export interface AppBindings {
  Bindings: Env;
}

export function createApp(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  app.use(securityHeaders());
  app.use("/api/*", corsMiddleware());

  // People who only know the short-link domain (e.g. from a QR code that led to a
  // scam) land on the web app, where they can find out who runs it and report the code.
  app.get("/", (c) => c.redirect(c.env.WEB_APP_URL, 302));
  app.get("/report", (c) => c.redirect(`${c.env.WEB_APP_URL}#/report`, 302));

  app.get("/api/health", (c) => c.json({ ok: true }));
  app.route("/api/links", linksRoutes());
  app.route("/api/reports", reportsRoutes());
  app.route("/api/admin", adminRoutes());
  app.route("/r", redirectRoutes());

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
