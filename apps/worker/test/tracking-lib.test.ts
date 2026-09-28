import { describe, expect, it } from "vitest";

import { isBotUserAgent } from "../src/lib/bot-detect.js";
import { parsePrimaryLanguage } from "../src/lib/language.js";
import { parseUserAgent } from "../src/lib/user-agent.js";
import { computeVisitorHash } from "../src/lib/visitor-hash.js";

import { HUMAN_UAS, PREVIEWER_UAS } from "./fixtures/user-agents.js";

describe("parseUserAgent", () => {
  it("classifies phones as mobile", () => {
    const iphone = parseUserAgent(HUMAN_UAS.iphoneSafari ?? null);
    expect(iphone.deviceType).toBe("mobile");
    expect(iphone.os).toBe("iOS");
    const android = parseUserAgent(HUMAN_UAS.androidChrome ?? null);
    expect(android.deviceType).toBe("mobile");
    expect(android.os).toBe("Android");
  });

  it("classifies tablets", () => {
    expect(parseUserAgent(HUMAN_UAS.ipadSafari ?? null).deviceType).toBe("tablet");
  });

  it("classifies desktop OSes", () => {
    expect(parseUserAgent(HUMAN_UAS.windowsChrome ?? null).deviceType).toBe("desktop");
    expect(parseUserAgent(HUMAN_UAS.macSafari ?? null).deviceType).toBe("desktop");
    expect(parseUserAgent(HUMAN_UAS.linuxFirefox ?? null).deviceType).toBe("desktop");
  });

  it("returns browser families without versions", () => {
    const parsed = parseUserAgent(HUMAN_UAS.windowsChrome ?? null);
    expect(parsed.browser).toBe("Chrome");
    expect(parsed.browser).not.toMatch(/\d/);
  });

  it("falls back to other/null on unknown or missing UA", () => {
    expect(parseUserAgent(null)).toEqual({ deviceType: "other", os: null, browser: null });
    expect(parseUserAgent("???").deviceType).toBe("other");
  });
});

describe("isBotUserAgent", () => {
  it.each(Object.entries(PREVIEWER_UAS))("flags %s", (_name, ua) => {
    expect(isBotUserAgent(ua)).toBe(true);
  });

  it.each(Object.entries(HUMAN_UAS))("does not flag %s", (_name, ua) => {
    expect(isBotUserAgent(ua)).toBe(false);
  });

  it("treats a missing UA as bot", () => {
    expect(isBotUserAgent(null)).toBe(true);
    expect(isBotUserAgent("  ")).toBe(true);
  });
});

describe("parsePrimaryLanguage", () => {
  it("extracts the primary tag", () => {
    expect(parsePrimaryLanguage("fr-FR,fr;q=0.9,en;q=0.8")).toBe("fr");
    expect(parsePrimaryLanguage("en;q=0.5")).toBe("en");
    expect(parsePrimaryLanguage("PT-br")).toBe("pt");
  });

  it("returns null for missing, wildcard or malformed headers", () => {
    expect(parsePrimaryLanguage(null)).toBeNull();
    expect(parsePrimaryLanguage("*")).toBeNull();
    expect(parsePrimaryLanguage("1234,fr")).toBeNull();
    expect(parsePrimaryLanguage("")).toBeNull();
  });
});

describe("computeVisitorHash", () => {
  it("is deterministic and sensitive to every input", async () => {
    const base = await computeVisitorHash("salt", "slug", "1.2.3.4", "ua");
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    expect(await computeVisitorHash("salt", "slug", "1.2.3.4", "ua")).toBe(base);
    expect(await computeVisitorHash("other", "slug", "1.2.3.4", "ua")).not.toBe(base);
    expect(await computeVisitorHash("salt", "other", "1.2.3.4", "ua")).not.toBe(base);
    expect(await computeVisitorHash("salt", "slug", "5.6.7.8", "ua")).not.toBe(base);
    expect(await computeVisitorHash("salt", "slug", "1.2.3.4", "other")).not.toBe(base);
  });
});
