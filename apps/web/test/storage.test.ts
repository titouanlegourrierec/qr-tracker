import { afterEach, describe, expect, it, vi } from "vitest";

import {
  exportCodesJson,
  importCodesJson,
  loadCodes,
  removeCode,
  saveCode,
} from "../src/lib/storage.js";
import type { StoredCode } from "../src/lib/storage.js";

function code(slug: string, createdAt = "2026-09-28T10:00:00.000Z"): StoredCode {
  return { slug, label: `Label ${slug}`, secretKey: "k".repeat(43), createdAt };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("local codes storage", () => {
  it("starts empty and persists saved codes", () => {
    expect(loadCodes()).toEqual([]);
    expect(saveCode(code("aaaaaaa"))).toBe(true);
    saveCode(code("bbbbbbb", "2026-09-29T10:00:00.000Z"));
    const loaded = loadCodes();
    expect(loaded).toHaveLength(2);
    // Newest first.
    expect(loaded[0]?.slug).toBe("bbbbbbb");
  });

  it("replaces an existing slug instead of duplicating it", () => {
    saveCode(code("aaaaaaa"));
    saveCode({ ...code("aaaaaaa"), label: "Updated" });
    const loaded = loadCodes();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.label).toBe("Updated");
  });

  it("reports when the browser refuses to store the code", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });
    expect(saveCode(code("ccccccc"))).toBe(false);
    expect(loadCodes()).toEqual([]);
  });

  it("removes codes by slug", () => {
    saveCode(code("aaaaaaa"));
    removeCode("aaaaaaa");
    expect(loadCodes()).toEqual([]);
  });

  it("returns [] on corrupt or wrong-shape data", () => {
    window.localStorage.setItem("qr-tracker.codes.v1", "{not json");
    expect(loadCodes()).toEqual([]);
    window.localStorage.setItem("qr-tracker.codes.v1", JSON.stringify({ version: 2, items: [] }));
    expect(loadCodes()).toEqual([]);
    window.localStorage.setItem(
      "qr-tracker.codes.v1",
      JSON.stringify({ version: 1, items: [{ slug: "bad slug!" }] }),
    );
    expect(loadCodes()).toEqual([]);
  });

  it("round-trips through JSON export/import and merges by slug", () => {
    saveCode(code("aaaaaaa"));
    const backup = exportCodesJson();

    window.localStorage.clear();
    saveCode({ ...code("aaaaaaa"), label: "Old label" });
    saveCode(code("ccccccc"));

    const added = importCodesJson(backup);
    expect(added).toBe(1);
    const loaded = loadCodes();
    expect(loaded).toHaveLength(2);
    // Imported entry won over the local one with the same slug.
    expect(loaded.find((c) => c.slug === "aaaaaaa")?.label).toBe("Label aaaaaaa");
  });

  it("rejects invalid imports without touching the store", () => {
    saveCode(code("aaaaaaa"));
    expect(importCodesJson("not json")).toBeNull();
    expect(importCodesJson(JSON.stringify({ version: 1, items: [{ slug: "x" }] }))).toBeNull();
    expect(loadCodes()).toHaveLength(1);
  });
});
