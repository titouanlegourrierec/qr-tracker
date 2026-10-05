import { describe, expect, it } from "vitest";

import { parseSlugInput } from "../src/lib/short-link.js";

describe("parseSlugInput", () => {
  it("accepts a bare code or a full short link", () => {
    expect(parseSlugInput("Ab3xY9z")).toBe("Ab3xY9z");
    expect(parseSlugInput("  Ab3xY9z ")).toBe("Ab3xY9z");
    expect(parseSlugInput("https://qr-tracker.example.workers.dev/r/Ab3xY9z")).toBe("Ab3xY9z");
    expect(parseSlugInput("qr-tracker.example.workers.dev/r/Ab3xY9z/")).toBe("Ab3xY9z");
    expect(parseSlugInput("https://x.example/r/Ab3xY9z?utm=1")).toBe("Ab3xY9z");
  });

  it("rejects anything else", () => {
    for (const input of [
      "",
      "Ab3xY9",
      "Ab3xY9z8",
      "https://x.example/r/",
      "https://x.example/Ab3xY9z",
      "Ab3-Y9z",
    ]) {
      expect(parseSlugInput(input)).toBeNull();
    }
  });
});
