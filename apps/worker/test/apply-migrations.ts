import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

// Runs once per test file (isolated storage): bring the local D1 up to date.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
