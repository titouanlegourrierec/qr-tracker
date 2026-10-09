// Creates .dev.vars from the example on first run so `pnpm dev` works from a fresh clone,
// and adds settings introduced later to an existing .dev.vars (values already set win).
import { appendFileSync, copyFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, ".dev.vars");
const example = join(root, ".dev.vars.example");

/** Uncommented KEY=value lines of a dotenv file, by key. */
function settings(text) {
  const entries = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Z][A-Z0-9_]*)=/.exec(line);
    if (match?.[1] !== undefined) entries.set(match[1], line);
  }
  return entries;
}

if (!existsSync(target)) {
  copyFileSync(example, target);
  console.log("Created apps/worker/.dev.vars from .dev.vars.example");
} else {
  const current = readFileSync(target, "utf8");
  const present = settings(current);
  const missing = [...settings(readFileSync(example, "utf8"))].filter(([key]) => !present.has(key));
  if (missing.length > 0) {
    const prefix = current === "" || current.endsWith("\n") ? "" : "\n";
    appendFileSync(target, `${prefix}${missing.map(([, line]) => line).join("\n")}\n`);
    console.log(`Added ${missing.map(([key]) => key).join(", ")} to apps/worker/.dev.vars`);
  }
}
