# ADR 0002 — Per-link secret keys instead of accounts

Date: 2026-09-28 · Status: accepted

## Context

The brief rules out user accounts and passwords, but stats and management must be
restricted to the person who created the QR code.

## Decision

Each link gets a 256-bit key from `crypto.getRandomValues`, base64url-encoded (43 chars),
returned exactly once at creation. The server stores only the key's SHA-256 hex digest
and compares digests with `crypto.subtle.timingSafeEqual`. The key travels only in the
`Authorization: Bearer` header — and, client-side, only in the URL **fragment**
(`#/stats/:slug/:key`), which browsers never send to any server.

## Rationale

- 256 bits of entropy makes online brute force irrelevant (and the endpoints are
  rate-limited anyway); with that entropy, a single unsalted SHA-256 is an adequate
  storage hash — bcrypt/argon2 protect low-entropy passwords, which these are not.
- Hashing means a database leak does not leak usable keys.
- Constant-time comparison avoids timing side channels.
- The fragment-only rule keeps keys out of server logs, proxies, and referrers
  (the app also sets `Referrer-Policy: no-referrer`).

## Consequences

- A lost key is unrecoverable by design — the UI shows a prominent one-time warning, and
  the "My QR codes" localStorage list plus its JSON export mitigate accidental loss.
- Anyone with the link's key has full control of that link (no revocation short of
  deleting the link). Acceptable for the threat model of a lab tool.
- The admin kill switch uses a separate status value (`blocked`) that the owner's API
  surface cannot set or clear.
