# ADR 0003 — Privacy model and daily-salted visitor hashing

Date: 2026-09-28 · Status: accepted

## Context

The lab wants scan statistics (including unique-visitor estimates) without collecting
personal data: no stored IPs, no full user-agents, no persistent identifiers, no cookies.

## Decision

Per scan we store only: UTC timestamp; coarse geo from `request.cf` (country, region,
city, timezone, AS organization); device **family** data (mobile/tablet/desktop, OS and
browser names without versions); the primary `Accept-Language` tag; an `is_bot` flag; and
`visitor_hash = SHA-256(daily_salt | slug | ip | user_agent)`.

The salt is random per UTC day, created lazily on first use, and deleted by the daily
cron at 00:05 UTC, right after its day ends (only the current day's salt is ever read). Scans are purged after `RETENTION_DAYS`
(default 365). Raw IP and UA exist only transiently in the recording function.

## Rationale

- With the salt destroyed, the hash cannot be reversed (the input space is unsearchable
  without the 256-bit salt) nor linked across days → it is not a persistent identifier.
- Scoping the hash to the slug prevents cross-link correlation of the same visitor.
- Bot flagging keeps messaging-app previewers and crawlers out of human stats while still
  redirecting them.

## Consequences

- **Unique visitors are per-UTC-day approximations**: the same person counts once per
  day (and twice if their scans straddle UTC midnight). Documented in the privacy page
  and the dashboard label ("Visitors (unique per day)" since 1.3.0).
- Salt rotation at UTC midnight (not local midnight) keeps the model simple and matches
  the aggregation, at the cost of a slight mismatch with local-day boundaries.
- The rate limiter reuses the same salted-hash approach for IP keying, so no raw IP is
  ever written anywhere.
- Since 1.3.0 the AS organization (the visitor's network operator) is no longer stored:
  migration 0004 dropped the column with its values (data minimization).
