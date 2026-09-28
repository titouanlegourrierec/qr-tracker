# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- QR code creation with Turnstile protection, per-link secret keys (shown once,
  SHA-256-hashed at rest), PNG/SVG downloads and a private stats link.
- `GET /r/:slug` redirect (302, `no-store`) with asynchronous anonymous scan tracking:
  coarse geo, device/OS/browser families, language, bot flagging, daily-salted visitor
  hashes — no IPs, no full user-agents, no persistent identifiers.
- Stats API and dashboard: totals, per-day/per-hour series, hour-of-day and
  day-of-week distributions, top countries/cities/devices/OS/browsers/languages/ISPs,
  bot toggle, date ranges, timezone-aware bucketing, CSV export.
- Link management with the secret key: change destination, disable/enable, permanent
  delete (link + scans).
- Admin kill switch (`blocked` status the owner cannot lift) with a CLI
  (`scripts/admin.mjs`).
- Daily cron: salt rotation, scan retention purge (default 12 months), rate-limit
  window cleanup.
- D1-backed fixed-window rate limiting keyed by salted IP hashes.
- "My QR codes" local list with JSON export/import; privacy page; dark mode;
  WCAG 2.1 AA table alternatives for every chart.
- CI (format/lint/typecheck/tests/coverage/build + Playwright E2E) and deploy pipeline
  (D1 migrations → worker → GitHub Pages).
