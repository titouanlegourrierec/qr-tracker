# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **My QR codes** shows each code's number of scans, its last scan and whether it is
  disabled or blocked, from one request for the whole list
  (`POST /api/links/summaries`, keys in the body).
- The **Statistics** page accepts the pasted private link: no need to type the 43-character
  key.
- A **Retry** button when statistics or scan counts fail to load, a confirmation after a QR
  code is deleted, and a message when copying or creating the QR image fails.
- **Read-only link** to share a QR code's statistics: it opens the dashboard and the CSV
  export but cannot change, disable or delete the QR code. The owner creates, replaces or
  revokes it from the management panel (`POST`/`DELETE /api/links/:slug/view-key`, migration
  0005); "My QR codes" keeps it with the code and in the JSON export.
- The web app refuses to run inside a frame on another site (clickjacking protection, since
  GitHub Pages cannot send `frame-ancestors`).

### Changed

- The CSV export reads its date filters in the dashboard's time zone (new `tz` parameter,
  default Europe/Paris like the stats), so a "7 days" export holds the scans the dashboard
  counts. Scan times in the file stay in UTC.
- "Unique visitors" is now "Visitors (unique per day)", with a note on why someone who
  scans on several days counts several times.
- The dashboard names the time zone it uses, and dates follow the browser's language
  settings instead of a fixed British format.
- Timezone parameters are canonicalized (`eUrOpE/pArIs` → `Europe/Paris`) and the worker's
  formatter cache is bounded.
- Production CORS allows only the GitHub Pages origin: the localhost origins moved to
  `.dev.vars`, and `pnpm dev` appends new example settings to an existing `.dev.vars`.

### Removed

- The visitor's network operator (ISP) is no longer collected: the `as_organization` column
  is dropped with every stored value (migration 0004) and left the CSV export. The
  deprecated `topIsps` stats field stays, always empty, for web app versions cached before
  this release.

## [1.2.0] - 2026-10-09

### Added

- **Report abuse** page: anyone can report a QR code from its short link, with no account
  and without being identified. The worker's `/` and `/report` lead there. Operators triage
  with `node scripts/admin.mjs reports | disable | dismiss`, and a daily workflow e-mails
  them (through a failed run) while reports are waiting.
- Destinations are checked against Google Safe Browsing on creation and on every change of
  destination, once a `SAFE_BROWSING_API_KEY` secret is set (docs/DEPLOYMENT.md §11).
- "I have saved my secret key somewhere safe" confirmation: until it is ticked, closing or
  reloading the page asks for confirmation.
- **Legal notice** page (footer): publisher and contact, hosts, data controller, legal
  basis and data-protection rights. The privacy page now gives the contact e-mail for
  data requests instead of GitHub issues.

### Changed

- Lifting an operator block restores the owner's own choice: a link its owner had paused
  stays paused (blocks now live in their own `blocked_at` column, migration 0003).
- Top cities are ranked per country and shown as "City, Country": Paris, France and
  Paris, Texas no longer merge into one row.
- Each daily salt is deleted a few minutes after its day ends (cron moved to 00:05 UTC);
  it used to survive about 51 hours.
- Production deploys now wait for the end-to-end tests too; the _CI_ workflow runs on pull
  requests only.
- Dependabot pull requests that bump a major version are labelled "major update" with a
  warning comment, and TypeScript minor updates are held back (typescript-eslint supports
  TS < 6.1 only).
- The creation page now says so when the browser could not keep the QR code in
  "My QR codes" (private browsing, full storage), instead of claiming it was saved.
- Copy buttons are named after what they copy, and keyboard focus moves to the result after
  creating a QR code.

### Fixed

- Emptying a date field and pressing Apply now removes that bound instead of keeping the
  previous filter.
- A slow statistics response for an older filter can no longer overwrite a newer one.
- HEAD requests (link checkers) are no longer counted as scans.
- An owner request racing an operator block can no longer undo it.

## [1.1.0] - 2026-10-05

### Added

- World map navigation: zoom with the buttons, Ctrl/⌘ + scroll, trackpad pinch,
  two-finger pinch on touch screens or double-click, and drag to move.

### Changed

- Statistics layout: "Scans per day" and "Scans per hour" side by side; the map spans the
  full width, with Countries and Cities side by side below it.
- The world map is now SVG drawn with d3-geo instead of chartjs-chart-geo: sharp at any
  zoom level and lighter to download.

### Fixed

- Map tooltips showed "undefined" instead of the country name.
- Destinations are now stored normalized: a URL typed with a single slash
  (`https:/example.com`) passed validation but sent scanners to a 404 on the worker, and
  could be used to make a link redirect to itself.
- A stats or export request with `to=9999-12-31` looped until the worker was killed; query
  dates are now limited to 2000-01-01…2099-12-31 and the date pickers stop at today.
- The "link disabled" page (410) could stay cached in Chrome after the link was re-enabled;
  the 404/410 pages are now `no-store`.
- Opening another link's private URL from a dashboard kept the previous link's form state:
  saving could write link A's destination into link B.
- Deployments from `main` failed since 2026-09-29: two separately merged dependency
  updates had left the lockfile inconsistent.

### Security

- Workers invocation logs are disabled: they recorded every request, including IP
  addresses and full user-agents, for 3 days.
- If D1 is unavailable (outage or exhausted daily quota), redirects fall back to the last
  known state of recently scanned links instead of failing, and unknown links get a 503
  page. See docs/DEPLOYMENT.md §10 for flood protection beyond the free plan.

## [1.0.0] - 2026-09-28

First public release.

### Added

- QR code creation for any public http(s) URL, protected by Cloudflare Turnstile, with
  PNG (print) and SVG downloads, a short link and a private statistics link.
- Per-link secret keys: 256-bit, shown once, stored only as a SHA-256 hash, and kept in
  the URL fragment (never sent to the server in a path or query string).
- `GET /r/:slug` redirect (302, `no-store`) with asynchronous anonymous scan tracking:
  coarse location, device/OS/browser families, language, bot flagging and daily-salted
  visitor hashes — no IP addresses, no full user-agents, no persistent identifiers.
- Statistics dashboard: totals, scans over time, world map of scan locations, top
  countries and cities, hour-of-day and day-of-week patterns, devices, operating
  systems, browsers and languages; date ranges, timezone-aware bucketing, bot filter
  and CSV export.
- Link management with the secret key: change the destination without reprinting,
  disable/re-enable, permanent delete (link and scans).
- "My QR codes" list stored in the browser only, with JSON export/import.
- Admin kill switch (`blocked` status the owner cannot lift) with a CLI
  (`scripts/admin.mjs`).
- Daily maintenance cron: salt rotation, 12-month scan retention, rate-limit cleanup.
- D1-backed rate limiting keyed by salted IP hashes.
- Light/dark themes, self-hosted font, privacy page, and an accessible table
  alternative for every chart.
- CI (format, lint, typecheck, unit/integration tests with coverage, Playwright E2E)
  and a deploy pipeline (D1 migrations → worker → GitHub Pages → production smoke test).

[Unreleased]: https://github.com/titouanlegourrierec/qr-tracker/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/titouanlegourrierec/qr-tracker/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/titouanlegourrierec/qr-tracker/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/titouanlegourrierec/qr-tracker/releases/tag/v1.0.0
