import { describe, expect, it } from "vitest";

import { isPrivateHostname, MAX_TARGET_URL_LENGTH, validateTargetUrl } from "../src/index.js";

function reasonOf(raw: string, blockedHosts?: readonly string[]) {
  const result = validateTargetUrl(raw, blockedHosts ? { blockedHosts } : {});
  return result.ok ? "ok" : result.reason;
}

describe("validateTargetUrl", () => {
  it("accepts plain http and https URLs", () => {
    expect(reasonOf("https://example.com")).toBe("ok");
    expect(reasonOf("http://example.com/path?q=1#frag")).toBe("ok");
    expect(reasonOf("https://sub.domain.example.co.uk:8443/x")).toBe("ok");
  });

  it("returns the parsed URL on success", () => {
    const result = validateTargetUrl("https://example.com/a b");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.url.pathname).toBe("/a%20b");
  });

  it("rejects malformed URLs", () => {
    expect(reasonOf("not a url")).toBe("malformed");
    expect(reasonOf("")).toBe("malformed");
    expect(reasonOf("example.com")).toBe("malformed");
  });

  it("rejects non-http(s) protocols", () => {
    expect(reasonOf("ftp://example.com")).toBe("protocol");
    expect(reasonOf("javascript:alert(1)")).toBe("protocol");
    expect(reasonOf("data:text/html,hello")).toBe("protocol");
    expect(reasonOf("file:///etc/passwd")).toBe("protocol");
  });

  it("rejects embedded credentials", () => {
    expect(reasonOf("https://user:pass@example.com")).toBe("credentials");
    expect(reasonOf("https://user@example.com")).toBe("credentials");
  });

  it("rejects URLs longer than the maximum", () => {
    const long = `https://example.com/${"a".repeat(MAX_TARGET_URL_LENGTH)}`;
    expect(reasonOf(long)).toBe("too-long");
  });

  it("rejects URLs whose normalized form exceeds the maximum", () => {
    // Each "é" is 1 character as typed but 6 once percent-encoded ("%C3%A9").
    const raw = `https://example.com/${"é".repeat(400)}`;
    expect(raw.length).toBeLessThanOrEqual(MAX_TARGET_URL_LENGTH);
    expect(reasonOf(raw)).toBe("too-long");
  });

  it("normalizes sloppy spellings to an absolute URL", () => {
    // Browsers resolve these against the redirect's own URL when sent verbatim in
    // Location, so callers must store url.href instead of the raw input.
    for (const [raw, href] of [
      ["https:/example.com/page", "https://example.com/page"],
      ["https:example.com", "https://example.com/"],
      ["https:/a.b/../r/AAAAAAA", "https://a.b/r/AAAAAAA"],
      ["https://example.com/a\nb", "https://example.com/ab"],
    ] as const) {
      const result = validateTargetUrl(raw);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.url.href).toBe(href);
    }
  });

  it("rejects localhost and reserved TLDs", () => {
    expect(reasonOf("http://localhost")).toBe("private-host");
    expect(reasonOf("http://localhost:3000")).toBe("private-host");
    expect(reasonOf("https://app.localhost")).toBe("private-host");
    expect(reasonOf("https://foo.local")).toBe("private-host");
    expect(reasonOf("https://db.internal")).toBe("private-host");
    expect(reasonOf("https://demo.test")).toBe("private-host");
    expect(reasonOf("https://x.invalid")).toBe("private-host");
    expect(reasonOf("https://router.home.arpa")).toBe("private-host");
  });

  it("rejects trailing-dot bypass attempts", () => {
    expect(reasonOf("http://localhost.")).toBe("private-host");
  });

  it("rejects dotless intranet hostnames", () => {
    expect(reasonOf("http://intranet")).toBe("private-host");
    expect(reasonOf("http://server:8080/a")).toBe("private-host");
  });

  it("rejects private and reserved IPv4 ranges", () => {
    for (const ip of [
      "0.0.0.0",
      "10.0.0.1",
      "100.64.0.1",
      "127.0.0.1",
      "169.254.169.254",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "224.0.0.1",
      "255.255.255.255",
    ]) {
      expect(reasonOf(`http://${ip}/`)).toBe("private-host");
    }
  });

  it("accepts public IPv4 addresses", () => {
    expect(reasonOf("http://93.184.216.34/")).toBe("ok");
    expect(reasonOf("http://172.32.0.1/")).toBe("ok");
    expect(reasonOf("http://100.128.0.1/")).toBe("ok");
  });

  it("rejects private IPv6 addresses", () => {
    for (const ip of ["[::1]", "[::]", "[fc00::1]", "[fd12:3456::1]", "[fe80::1]", "[febf::1]"]) {
      expect(reasonOf(`http://${ip}/`)).toBe("private-host");
    }
  });

  it("rejects IPv4-mapped IPv6 pointing at private ranges", () => {
    expect(reasonOf("http://[::ffff:192.168.1.1]/")).toBe("private-host");
    expect(reasonOf("http://[::ffff:127.0.0.1]/")).toBe("private-host");
  });

  it("accepts public IPv6 addresses", () => {
    expect(reasonOf("http://[2606:4700::6810:84e5]/")).toBe("ok");
  });

  it("rejects blocked hosts case-insensitively", () => {
    expect(
      reasonOf("https://My-Worker.Example.workers.dev/r/abc", ["my-worker.example.workers.dev"]),
    ).toBe("blocked-host");
    expect(reasonOf("https://other.workers.dev", ["my-worker.example.workers.dev"])).toBe("ok");
  });
});

describe("isPrivateHostname", () => {
  it("treats the empty hostname as private", () => {
    expect(isPrivateHostname("")).toBe(true);
  });

  it("accepts normal public hostnames", () => {
    expect(isPrivateHostname("example.com")).toBe(false);
    expect(isPrivateHostname("example.com.")).toBe(false);
  });
});
