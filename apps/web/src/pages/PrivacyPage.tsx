import { en } from "../i18n/en.js";

/**
 * Static privacy page. Content is intentionally inline prose (not in en.ts):
 * it is a legal-style document, not reusable UI strings.
 */
export function PrivacyPage() {
  return (
    <>
      <h1>{en.privacy.title}</h1>

      <h2>What we collect on every scan</h2>
      <p>
        When someone scans a QR code, the redirect goes through our server, which records{" "}
        <strong>anonymous</strong> data:
      </p>
      <ul>
        <li>the date and time of the scan (UTC);</li>
        <li>the approximate country, region, city and timezone (derived from the network);</li>
        <li>the network operator or internet service provider (network organization);</li>
        <li>
          the device type (mobile, tablet, desktop) and the operating-system and browser families —
          never exact versions;
        </li>
        <li>the browser&apos;s primary language (e.g. &ldquo;en&rdquo;);</li>
        <li>a &ldquo;bot&rdquo; flag for link previews and search-engine crawlers;</li>
        <li>
          a visitor fingerprint: a cryptographic hash (SHA-256) combining a random salt{" "}
          <em>rotated every day</em>, the IP address and the browser.
        </li>
      </ul>

      <h2>What we do not collect</h2>
      <ul>
        <li>
          <strong>No IP address is ever stored</strong> or logged; it is only used in memory, for a
          few milliseconds, to compute the day&apos;s fingerprint.
        </li>
        <li>No full browser string (user-agent) is kept.</li>
        <li>
          No cookies, no trackers, no third-party analytics — neither on this site nor during scans.
        </li>
        <li>
          No persistent identifier: the previous day&apos;s salts are destroyed every day, so scans
          from the same visitor cannot be linked from one day to the next. &ldquo;Unique
          visitors&rdquo; is a per-day approximation.
        </li>
      </ul>

      <h2>Retention</h2>
      <p>
        Scans are kept for <strong>12 months</strong>, then deleted automatically every night. Daily
        salts are deleted after one day.
      </p>

      <h2>Deleting data</h2>
      <p>
        Whoever holds a QR code&apos;s secret key can permanently delete the link{" "}
        <em>and all of its statistics</em> at any time from the management panel. For any other
        request, open an issue on{" "}
        <a href="https://github.com/titouanlegourrierec/qr-tracker/issues">GitHub</a>.
      </p>

      <h2>What about this site?</h2>
      <p>
        This site uses no cookies. The &ldquo;My QR codes&rdquo; list is stored only in your browser
        (localStorage) and never leaves your device. Creating a QR code is protected by Cloudflare
        Turnstile, which performs an anti-bot check without cookies or ad tracking.
      </p>
    </>
  );
}
