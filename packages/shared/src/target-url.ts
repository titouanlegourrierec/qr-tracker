import { MAX_TARGET_URL_LENGTH } from "./constants.js";

export type TargetUrlRejection =
  "malformed" | "protocol" | "credentials" | "too-long" | "private-host" | "blocked-host";

export type TargetUrlResult = { ok: true; url: URL } | { ok: false; reason: TargetUrlRejection };

const PRIVATE_TLDS = ["localhost", "local", "internal", "test", "invalid", "home.arpa"];

function isPrivateIpv4(host: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) return false;
  const octets = match.slice(1).map(Number);
  if (octets.some((o) => o > 255)) return false; // not a valid IPv4 → handled as hostname
  const [a = 0, b = 0] = octets;
  return (
    a === 0 || // "this network"
    a === 10 ||
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224 // multicast + reserved
  );
}

function isPrivateIpv6(host: string): boolean {
  // URL.hostname wraps IPv6 in brackets.
  if (!host.startsWith("[") || !host.endsWith("]")) return false;
  const addr = host.slice(1, -1).toLowerCase();
  if (addr === "::" || addr === "::1") return true;
  // Unique-local fc00::/7, link-local fe80::/10.
  if (/^f[cd]/.test(addr) || addr.startsWith("fe8") || addr.startsWith("fe9")) return true;
  if (addr.startsWith("fea") || addr.startsWith("feb")) return true;
  // IPv4-mapped: URL.hostname normalizes ::ffff:a.b.c.d to hex groups (::ffff:c0a8:101),
  // but accept both spellings and check the embedded IPv4.
  const mappedDotted = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(addr);
  if (mappedDotted?.[1]) return isPrivateIpv4(mappedDotted[1]);
  const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(addr);
  if (mappedHex?.[1] !== undefined && mappedHex[2] !== undefined) {
    const hi = Number.parseInt(mappedHex[1], 16);
    const lo = Number.parseInt(mappedHex[2], 16);
    return isPrivateIpv4(`${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`);
  }
  return false;
}

/** True for hostnames that can point inside a private network or at the machine itself. */
export function isPrivateHostname(rawHostname: string): boolean {
  // Normalize the (single) trailing dot of a fully-qualified name so "localhost." can't bypass.
  const hostname = rawHostname.toLowerCase().replace(/\.$/, "");
  if (hostname.length === 0) return true;
  if (isPrivateIpv4(hostname) || isPrivateIpv6(hostname)) return true;
  for (const tld of PRIVATE_TLDS) {
    if (hostname === tld || hostname.endsWith(`.${tld}`)) return true;
  }
  // A hostname without a dot is an intranet name (IPv6 literals contain ":").
  if (!hostname.includes(".") && !hostname.startsWith("[")) return true;
  return false;
}

export interface TargetUrlOptions {
  /** Extra hostnames to reject (e.g. the worker's own domain, to avoid redirect loops). */
  blockedHosts?: readonly string[];
}

/**
 * Validates a destination URL for a QR code: http(s) only, no embedded credentials,
 * bounded length, no private/loopback hosts, no blocked hosts.
 */
export function validateTargetUrl(raw: string, options: TargetUrlOptions = {}): TargetUrlResult {
  if (raw.length > MAX_TARGET_URL_LENGTH) return { ok: false, reason: "too-long" };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "protocol" };
  }
  if (url.username !== "" || url.password !== "") return { ok: false, reason: "credentials" };
  if (isPrivateHostname(url.hostname)) return { ok: false, reason: "private-host" };
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  const blocked = options.blockedHosts?.some((h) => h.toLowerCase() === hostname) ?? false;
  if (blocked) return { ok: false, reason: "blocked-host" };
  return { ok: true, url };
}
