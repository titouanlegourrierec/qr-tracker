import { defineConfig, devices } from "@playwright/test";

/**
 * E2E: real worker (wrangler dev + local D1, fresh state per run) and the
 * built SPA served by vite preview. Turnstile uses Cloudflare's test keys.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  forbidOnly: process.env.CI !== undefined,
  retries: process.env.CI === undefined ? 0 : 1,
  workers: 1,
  reporter: process.env.CI === undefined ? "list" : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:4173/qr-tracker/",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      // Fresh local D1 for deterministic runs; dev script applies migrations.
      command: "rm -rf apps/worker/.wrangler/state && pnpm --filter @qr-tracker/worker dev",
      url: "http://localhost:8787/api/health",
      reuseExistingServer: process.env.CI === undefined,
      gracefulShutdown: { signal: "SIGTERM", timeout: 3000 },
      stdout: "ignore",
      timeout: 120_000,
    },
    {
      // vite build only (typecheck already runs in `pnpm check`).
      command:
        "pnpm --filter @qr-tracker/web exec vite build && pnpm --filter @qr-tracker/web exec vite preview --port 4173 --strictPort",
      url: "http://localhost:4173/qr-tracker/",
      reuseExistingServer: process.env.CI === undefined,
      gracefulShutdown: { signal: "SIGTERM", timeout: 3000 },
      stdout: "ignore",
      timeout: 120_000,
    },
  ],
});
