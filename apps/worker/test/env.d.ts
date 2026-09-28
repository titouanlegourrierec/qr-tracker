import type { D1Migration } from "cloudflare:test";

declare global {
  namespace Cloudflare {
    /** Test-only bindings provided via miniflare in vitest.config.ts. */
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}

export {};
