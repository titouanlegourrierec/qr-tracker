# ADR 0004 — Abuse handling: Safe Browsing check and anonymous reports

Date: 2026-10-05 · Status: accepted (supersedes the reputation stub in PLAN.md §7.9)

## Context

Anyone can create a QR code, so the service can be used to point printed codes at phishing
or malware. If browser vendors or Cloudflare flag the worker's domain, every QR code
breaks for everyone. The free plan has no e-mail sending, and the repository is private,
so GitHub issues are not a reporting channel either.

## Decision

- **Destination check**: the Google Safe Browsing Lookup API (v4) runs on creation and on
  every change of destination. A match rejects the URL with `TARGET_URL_INVALID`. The check
  only runs when the optional `SAFE_BROWSING_API_KEY` secret is set, and it fails open: a
  timeout (3 s), an HTTP error or an unexpected body yields "unknown", which never blocks.
- **Reports**: `POST /api/reports` (link code, reason from a fixed list, optional details
  of up to 1,000 characters). Turnstile-protected and rate limited per daily-salted IP hash
  (5 per hour). Nothing identifying the reporter is stored. Reports are deleted with their
  link, when the operator dismisses them, and after `RETENTION_DAYS`.
- **Triage**: admin endpoints behind `ADMIN_TOKEN` (`GET /api/admin/reports`,
  `DELETE /api/admin/links/:slug/reports`), driven by `scripts/admin.mjs`.
- **Notification**: a daily GitHub Actions workflow runs `admin.mjs reports --fail-if-any`.
  A failed scheduled run is e-mailed by GitHub. The workflow prints counts only, so report
  contents never reach Actions logs, which become public with the repository.

## Rationale

- The Lookup API is the simplest integration: one POST per checked URL, free for
  non-commercial use. The privacy-preserving Update API (local hash-prefix lists) would need
  storage and sync that the free plan cannot carry. The only data sent is the destination
  URL, which the privacy page discloses.
- Failing open keeps creation available when Google is unreachable. The report queue and
  the kill switch remain the backstop.
- No automatic blocking from reports: a report form open to anyone would otherwise let
  anyone take down someone else's QR code.

## Consequences

- Safe Browsing only knows pages that are already flagged. A fresh phishing page passes
  the check until it is listed; reports cover that gap. A periodic re-check of active
  links would close it further (possible follow-up).
- The operator must look at the queue when the workflow fails; nothing is blocked
  automatically.
