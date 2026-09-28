import { env, exports } from "cloudflare:workers";

import { describe, expect, it } from "vitest";

const BASE = "https://qr-tracker.example.workers.dev";

describe("worker foundation", () => {
  it("serves /api/health", async () => {
    const res = await exports.default.fetch(`${BASE}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("applies migrations (all tables exist)", async () => {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    ).all<{ name: string }>();
    const names = results.map((r) => r.name);
    for (const table of ["links", "scans", "salts", "rate_limits"]) {
      expect(names).toContain(table);
    }
  });

  it("sets security headers on every response", async () => {
    const res = await exports.default.fetch(`${BASE}/api/health`);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("answers preflight for an allowed origin", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/links`, {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:5173",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "Content-Type",
        },
      }),
    );
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain("Content-Type");
  });

  it("does not allow unknown origins", async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/health`, { headers: { Origin: "https://evil.example" } }),
    );
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("returns the canonical JSON error shape for unknown routes", async () => {
    const res = await exports.default.fetch(`${BASE}/api/nope`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: "NOT_FOUND", message: "Resource not found" },
    });
  });
});
