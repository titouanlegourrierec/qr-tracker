import { describe, expect, it } from "vitest";

import {
  countryAlpha2ForFeature,
  countryName,
  countryNumericId,
  isOnWorldMap,
  languageName,
} from "../src/lib/countries.js";

describe("countryAlpha2ForFeature", () => {
  it("maps world-atlas numeric ids back to alpha-2 codes", () => {
    expect(countryAlpha2ForFeature("250", "France")).toBe("FR");
    expect(countryAlpha2ForFeature("076", "Brazil")).toBe("BR");
    expect(countryAlpha2ForFeature(76, "Brazil")).toBe("BR");
    expect(countryAlpha2ForFeature("999", "Nowhere")).toBeNull();
  });

  it("recognizes Kosovo, which has no numeric id", () => {
    expect(countryAlpha2ForFeature(undefined, "Kosovo")).toBe("XK");
    expect(countryAlpha2ForFeature(undefined, "Somaliland")).toBeNull();
  });
});

describe("isOnWorldMap", () => {
  it("accepts mappable codes only", () => {
    expect(isOnWorldMap("fr")).toBe(true);
    expect(isOnWorldMap("XK")).toBe(true);
    expect(isOnWorldMap("T1")).toBe(false);
  });
});

describe("countryNumericId", () => {
  it("maps well-known alpha-2 codes to world-atlas numeric ids", () => {
    expect(countryNumericId("FR")).toBe("250");
    expect(countryNumericId("US")).toBe("840");
    expect(countryNumericId("GB")).toBe("826");
    expect(countryNumericId("DE")).toBe("276");
    expect(countryNumericId("KR")).toBe("410");
    expect(countryNumericId("JP")).toBe("392");
    expect(countryNumericId("CN")).toBe("156");
    expect(countryNumericId("BR")).toBe("076");
    expect(countryNumericId("IN")).toBe("356");
    expect(countryNumericId("CA")).toBe("124");
  });

  it("is case-insensitive and rejects special/unknown codes", () => {
    expect(countryNumericId("fr")).toBe("250");
    expect(countryNumericId("XX")).toBeNull();
    expect(countryNumericId("T1")).toBeNull();
  });
});

describe("countryName", () => {
  it("resolves English country names", () => {
    expect(countryName("FR")).toBe("France");
    expect(countryName("KR")).toBe("South Korea");
  });

  it("falls back to the raw code for invalid regions", () => {
    expect(countryName("T1")).toBe("T1");
    // "XX" is syntactically valid; Intl returns it unchanged when unknown.
    expect(countryName("XX")).toBe("XX");
  });
});

describe("languageName", () => {
  it("resolves English language names and falls back on garbage", () => {
    expect(languageName("fr")).toBe("French");
    expect(languageName("en")).toBe("English");
    expect(languageName("??")).toBe("??");
  });
});
