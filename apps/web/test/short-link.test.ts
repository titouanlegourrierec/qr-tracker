import { describe, expect, it } from "vitest";

import { parseSlugInput, parseStatsLink } from "../src/lib/short-link.js";

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

describe("parseStatsLink", () => {
  const key = "Ab-_" + "x".repeat(39);

  it("extracts the code and key from a pasted private link", () => {
    expect(parseStatsLink(`https://someone.github.io/qr-tracker/#/stats/Ab3xY9z/${key}`)).toEqual({
      slug: "Ab3xY9z",
      secretKey: key,
    });
    expect(parseStatsLink(`  http://localhost:5173/qr-tracker/#/stats/Ab3xY9z/${key}/ `)).toEqual({
      slug: "Ab3xY9z",
      secretKey: key,
    });
  });

  it("rejects bare codes, short links and malformed private links", () => {
    for (const input of [
      "Ab3xY9z",
      "https://x.example/r/Ab3xY9z",
      `https://x.example/#/stats/Ab3xY9/${key}`,
      `https://x.example/#/stats/Ab3xY9z/${key.slice(1)}`,
      `https://x.example/#/stats/Ab3xY9z/${key}/extra`,
    ]) {
      expect(parseStatsLink(input)).toBeNull();
    }
  });
});
