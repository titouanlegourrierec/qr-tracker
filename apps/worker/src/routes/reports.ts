import { createReportRequestSchema } from "@qr-tracker/shared";
import type { CreateReportResponse } from "@qr-tracker/shared";
import { Hono } from "hono";

import type { AppBindings } from "../app.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { createReport } from "../services/reports.js";

import { parseBody } from "./links.js";

export function reportsRoutes(): Hono<AppBindings> {
  const routes = new Hono<AppBindings>();

  routes.post("/", rateLimit("report", { failOpen: false }), async (c) => {
    const body = await parseBody(c, createReportRequestSchema);
    await createReport(c.env, body);
    const response: CreateReportResponse = { received: true };
    return c.json(response, 201);
  });

  return routes;
}
