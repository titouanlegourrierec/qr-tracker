# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to
[Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/titouanlegourrierec/qr-tracker/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/titouanlegourrierec/qr-tracker/releases/tag/v1.0.0
