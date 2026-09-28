import { createApp } from "./app.js";
import { logError } from "./lib/log.js";
import { runDailyMaintenance } from "./services/cron.js";

const app = createApp();

export default {
  fetch: app.fetch,
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      runDailyMaintenance(env).catch((error: unknown) => {
        logError("cron_failed", error);
      }),
    );
  },
} satisfies ExportedHandler<Env>;
