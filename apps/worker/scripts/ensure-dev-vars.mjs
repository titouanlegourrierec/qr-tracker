// Creates .dev.vars from the example on first run so `pnpm dev` works from a fresh clone.
import { copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, ".dev.vars");
if (!existsSync(target)) {
  copyFileSync(join(root, ".dev.vars.example"), target);
  console.log("Created apps/worker/.dev.vars from .dev.vars.example");
}
