import { secretKeySchema, slugSchema } from "@qr-tracker/shared";
import { z } from "zod";

/**
 * "My QR codes" — stored in this browser's localStorage only (clearly labelled
 * as such in the UI). Reads are Zod-validated; a corrupt store yields [].
 */

const STORAGE_KEY = "qr-tracker.codes.v1";

export const storedCodeSchema = z.object({
  slug: slugSchema,
  label: z.string().nullable(),
  secretKey: secretKeySchema,
  createdAt: z.iso.datetime(),
  /** Read-only key the owner created to share the statistics (absent in older backups). */
  viewKey: secretKeySchema.optional(),
});
export type StoredCode = z.infer<typeof storedCodeSchema>;

const storeSchema = z.object({
  version: z.literal(1),
  items: z.array(storedCodeSchema),
});

function readStore(): StoredCode[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed = storeSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.items : [];
  } catch {
    return [];
  }
}

/** Returns false when the browser refused to store the list (quota, disabled storage). */
function writeStore(items: StoredCode[]): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, items }));
    return true;
  } catch {
    // The list is a convenience, never fatal — but callers must not claim it was saved.
    return false;
  }
}

export function loadCodes(): StoredCode[] {
  return [...readStore()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** Adds or replaces a code; returns false when it could not be stored in this browser. */
export function saveCode(code: StoredCode): boolean {
  const items = readStore().filter((c) => c.slug !== code.slug);
  items.push(code);
  return writeStore(items);
}

/**
 * Keeps (or forgets, with null) the read-only key of a code already in the list. Returns
 * false when the code is not in this browser's list or the list could not be written.
 */
export function setStoredViewKey(slug: string, viewKey: string | null): boolean {
  const items = readStore();
  const code = items.find((c) => c.slug === slug);
  if (code === undefined) return false;
  const updated: StoredCode = {
    slug: code.slug,
    label: code.label,
    secretKey: code.secretKey,
    createdAt: code.createdAt,
    ...(viewKey === null ? {} : { viewKey }),
  };
  return writeStore(items.map((c) => (c.slug === slug ? updated : c)));
}

export function removeCode(slug: string): void {
  writeStore(readStore().filter((c) => c.slug !== slug));
}

/** JSON export of the local list (backup / transfer between browsers). */
export function exportCodesJson(): string {
  return JSON.stringify({ version: 1, items: readStore() }, null, 2);
}

/**
 * Imports a previously exported JSON backup, merging by slug (imported entries
 * win). Returns the number of added/updated codes, or null when invalid.
 */
export function importCodesJson(json: string): number | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  const result = storeSchema.safeParse(parsed);
  if (!result.success) return null;
  const existing = readStore();
  const imported = result.data.items;
  const importedSlugs = new Set(imported.map((c) => c.slug));
  writeStore([...existing.filter((c) => !importedSlugs.has(c.slug)), ...imported]);
  return imported.length;
}
