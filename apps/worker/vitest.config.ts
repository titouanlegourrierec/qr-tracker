import path from "node:path";

import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

const migrations = await readD1Migrations(path.join(import.meta.dirname, "migrations"));

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: migrations,
          // Turnstile "always passes" test secret; individual tests exercise
          // failure paths by mocking the siteverify call.
          TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
          ADMIN_TOKEN: "test-admin-token",
          // As under `wrangler dev` (.dev.vars): the production value plus vite dev.
          ALLOWED_ORIGINS: "https://titouanlegourrierec.github.io,http://localhost:5173",
        },
      },
    }),
  ],
  test: {
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/apply-migrations.ts"],
    coverage: {
      provider: "istanbul",
      include: ["src/**/*.ts"],
      thresholds: { lines: 90 },
    },
  },
});
