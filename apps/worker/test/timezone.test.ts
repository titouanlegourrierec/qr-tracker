import { describe, expect, it } from "vitest";

import { toCsv } from "../src/lib/csv.js";
import {
  addDays,
  formatterCacheSize,
  inclusiveDayCount,
  localDayStartUtcMs,
  localToday,
  utcDayToLocalDate,
  utcInstantToLocalParts,
} from "../src/lib/timezone.js";

describe("formatter cache", () => {
  it("stays bounded when many offset timezones are requested", () => {
    const noonUtc = Date.parse("2026-06-15T12:00:00Z");
    for (let minutes = 0; minutes < 300; minutes++) {
      const offset = `+${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
      expect(utcInstantToLocalParts(noonUtc, offset).hour).toBe(12 + Math.floor(minutes / 60));
    }
    expect(formatterCacheSize()).toBeLessThanOrEqual(100);
  });
});

describe("utcInstantToLocalParts", () => {
  it("maps winter (CET, +1) and summer (CEST, +2) instants for Paris", () => {
    const winter = utcInstantToLocalParts(Date.parse("2026-01-15T14:00:00Z"), "Europe/Paris");
    expect(winter).toEqual({ date: "2026-01-15", hour: 15, dayOfWeek: 3 }); // Thursday
    const summer = utcInstantToLocalParts(Date.parse("2026-06-15T14:00:00Z"), "Europe/Paris");
    expect(summer.hour).toBe(16);
  });

  it("rolls over to the next local day near UTC midnight", () => {
    const parts = utcInstantToLocalParts(Date.parse("2026-06-01T22:30:00Z"), "Europe/Paris");
    expect(parts.date).toBe("2026-06-02");
    expect(parts.hour).toBe(0);
  });

  it("uses Monday-first day-of-week indexing", () => {
    // 2026-09-28 is a Monday.
    expect(utcInstantToLocalParts(Date.parse("2026-09-28T10:00:00Z"), "UTC").dayOfWeek).toBe(0);
    expect(utcInstantToLocalParts(Date.parse("2026-09-27T10:00:00Z"), "UTC").dayOfWeek).toBe(6);
  });

  it("handles UTC and far-offset zones", () => {
    expect(utcInstantToLocalParts(Date.parse("2026-03-01T00:00:00Z"), "UTC")).toEqual({
      date: "2026-03-01",
      hour: 0,
      dayOfWeek: 6,
    });
    const tokyo = utcInstantToLocalParts(Date.parse("2026-03-01T20:00:00Z"), "Asia/Tokyo");
    expect(tokyo.date).toBe("2026-03-02");
    expect(tokyo.hour).toBe(5);
  });
});

describe("localDayStartUtcMs", () => {
  it("computes local midnight in UTC for Paris winter and summer", () => {
    expect(new Date(localDayStartUtcMs("2026-01-15", "Europe/Paris")).toISOString()).toBe(
      "2026-01-14T23:00:00.000Z",
    );
    expect(new Date(localDayStartUtcMs("2026-06-15", "Europe/Paris")).toISOString()).toBe(
      "2026-06-14T22:00:00.000Z",
    );
  });

  it("is identity for UTC", () => {
    expect(new Date(localDayStartUtcMs("2026-06-15", "UTC")).toISOString()).toBe(
      "2026-06-15T00:00:00.000Z",
    );
  });

  it("stays consistent across the Paris DST transitions", () => {
    // 2026-03-29: clocks jump 02:00→03:00 local; midnight itself exists (23:00Z prev day).
    expect(new Date(localDayStartUtcMs("2026-03-29", "Europe/Paris")).toISOString()).toBe(
      "2026-03-28T23:00:00.000Z",
    );
    // 2026-10-25: fall back; midnight is 22:00Z prev day (still CEST at midnight).
    expect(new Date(localDayStartUtcMs("2026-10-25", "Europe/Paris")).toISOString()).toBe(
      "2026-10-24T22:00:00.000Z",
    );
  });
});

describe("date helpers", () => {
  it("addDays crosses month and year boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("inclusiveDayCount counts both endpoints", () => {
    expect(inclusiveDayCount("2026-06-01", "2026-06-01")).toBe(1);
    expect(inclusiveDayCount("2026-06-01", "2026-06-14")).toBe(14);
  });

  it("localToday reflects the timezone", () => {
    const nowMs = Date.parse("2026-06-01T23:30:00Z");
    expect(localToday("UTC", nowMs)).toBe("2026-06-01");
    expect(localToday("Europe/Paris", nowMs)).toBe("2026-06-02");
  });

  it("utcDayToLocalDate attributes a UTC day to the majority local day", () => {
    expect(utcDayToLocalDate("2026-06-01", "Europe/Paris")).toBe("2026-06-01");
    expect(utcDayToLocalDate("2026-06-01", "Pacific/Auckland")).toBe("2026-06-02");
  });
});

describe("toCsv", () => {
  it("serializes header and rows with escaping", () => {
    const csv = toCsv(
      ["a", "b"],
      [
        { a: "plain", b: 'with "quotes"' },
        { a: "comma,here", b: null },
        { a: "line\nbreak", b: 1 },
      ],
    );
    expect(csv).toBe('a,b\r\nplain,"with ""quotes"""\r\n"comma,here",\r\n"line\nbreak",1\r\n');
  });

  it("renders missing fields as empty cells", () => {
    expect(toCsv(["x", "y"], [{ x: "1" }])).toBe("x,y\r\n1,\r\n");
  });
});
