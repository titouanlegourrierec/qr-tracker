# ADR 0001 — Cloudflare Workers + D1 for the backend

Date: 2026-09-28 · Status: accepted

## Context

The tool must be free to run, always on (QR scans arrive at any time), fast for a
redirect (it sits between the scan and the destination), and maintained by a small lab
without ops effort. The frontend is a static site on GitHub Pages.

## Decision

Cloudflare Workers (free plan) with a D1 database, Hono for routing, deployed on the
`workers.dev` subdomain. Wrangler manages D1 SQL migrations.

## Rationale

- Free plan covers the expected load comfortably: 100k requests/day, D1 5M reads +
  100k writes/day, cron triggers included, Turnstile free.
- Workers run at the edge → redirect latency is a few ms; `ctx.waitUntil()` lets the scan
  be recorded after the response.
- `request.cf` provides country/region/city/timezone/AS organization without any
  third-party geo-IP dependency or database.
- D1 is SQLite: relational aggregation in SQL, migrations, atomic batches.
- First-class local dev and tests: `wrangler dev` and `@cloudflare/vitest-plugin` run the
  real runtime with a real local D1.

## Alternatives considered

- **Deno Deploy / Vercel / Netlify functions**: comparable compute, but no bundled
  relational DB on a free tier, and no equivalent of `request.cf` geo data.
- **VPS / self-hosted**: not free, needs ops (updates, TLS, monitoring).
- **Serverless + external free DB (Neon, Supabase)**: two accounts/providers to manage,
  higher latency from the edge, free tiers with sleep/limits.

## Consequences

- Vendor coupling to Cloudflare APIs (D1, `request.cf`, cron) — accepted; the layering
  (repositories isolate SQL, routes isolate HTTP) limits the blast radius.
- 10 ms CPU per invocation on the free plan → scan recording stays lean (one UA parse,
  one regex pass, one SHA-256).
