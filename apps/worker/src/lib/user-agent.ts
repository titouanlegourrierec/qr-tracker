import type { DeviceType } from "@qr-tracker/shared";
import UAParser from "ua-parser-js";

export interface ParsedUserAgent {
  deviceType: DeviceType;
  os: string | null;
  browser: string | null;
}

const DESKTOP_OS = new Set([
  "Windows",
  "Mac OS",
  "macOS",
  "Linux",
  "Ubuntu",
  "Debian",
  "Fedora",
  "Chrome OS",
  "Chromium OS",
  "FreeBSD",
  "OpenBSD",
]);

/**
 * Extracts coarse device/OS/browser families from a user-agent string.
 * Only family names are returned — never versions or the raw UA (privacy).
 */
export function parseUserAgent(userAgent: string | null): ParsedUserAgent {
  if (userAgent === null || userAgent.trim() === "") {
    return { deviceType: "other", os: null, browser: null };
  }
  const parsed = new UAParser(userAgent).getResult();
  const osName = parsed.os.name ?? null;
  const browserName = parsed.browser.name ?? null;

  let deviceType: DeviceType;
  switch (parsed.device.type) {
    case "mobile":
      deviceType = "mobile";
      break;
    case "tablet":
      deviceType = "tablet";
      break;
    case undefined:
      // ua-parser-js leaves desktop devices untyped.
      deviceType = osName !== null && DESKTOP_OS.has(osName) ? "desktop" : "other";
      break;
    default:
      deviceType = "other";
  }

  return { deviceType, os: osName, browser: browserName };
}
