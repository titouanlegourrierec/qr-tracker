# PLAN — QR code generator with scan analytics

Status: **awaiting approval** — no implementation before sign-off.
Date: 2026-09-28. All version and platform facts below were verified against official docs on this date.

---

## 1. Architecture

### 1.1 Overview

```
┌────────────────────────┐        ┌─────────────────────────────────────┐
│  apps/web (React SPA)  │  HTTPS │  apps/worker (Cloudflare Worker)    │
│  GitHub Pages          │───────▶│  Hono router, workers.dev domain    │
│  titouanlegourrierec.  │  JSON  │                                     │
│  github.io/qr-tracker/ │  API   │  routes → services → repositories   │
└────────────────────────┘        │        │                            │
          ▲                       │        ▼                            │
  QR scan │ 302 redirect          │  Cloudflare D1 (SQLite)             │
          │                       │  links, scans, salts, rate_limits   │
   ┌──────┴──────┐                └─────────────────────────────────────┘
   │ Phone /     │  GET /r/:slug          ▲
   │ any scanner │────────────────────────┘ scan recorded via ctx.waitUntil()
   └─────────────┘
```

- **`apps/web`** — Vite + React static SPA deployed to GitHub Pages under `/qr-tracker/`. No cookies, no analytics. Talks to the worker only via the JSON API.
- **`apps/worker`** — single Cloudflare Worker (free plan, `*.workers.dev`): redirect endpoint, JSON API, daily Cron Trigger. D1 for storage.
- **`packages/shared`** — Zod schemas + TypeScript types for every request/response body, error codes, and shared constants (slug alphabet, key length, limits). Single source of truth imported by both apps.

### 1.2 Worker layering

```
src/
  index.ts            # export default { fetch, scheduled }
  app.ts              # Hono app assembly: middleware + route mounting
  routes/             # HTTP only: parse → call service → shape response
  services/           # business logic, orchestration (links, scans, stats, admin)
  repositories/       # all SQL, one module per table
  lib/                # PURE functions: slug/key generation & hashing,
                      # URL validation, UA parsing + bot detection,
                      # visitor hash, Accept-Language parsing, timezone
                      # bucketing, CSV serialization, rate-limit window math
  middleware/         # auth (Bearer key), admin auth, rate limit, security headers, CORS
  i18n/               # HTML error pages for /r/:slug
```

Rules: no business logic in route handlers; everything in `lib/` is a pure function with unit tests; repositories are the only modules that touch D1.

### 1.3 Key platform facts (verified 2026-09-28)

| Fact                                                                                                  | Consequence                                                                     |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Workers free: 100k req/day, **10 ms CPU/invocation** (includes `waitUntil` work)                      | UA parse + isbot + one SHA-256 must stay lean; measured in `wrangler dev` at M4 |
| D1 free: 5M reads/day, 100k writes/day, 5 GB                                                          | Ample; rate-limit writes only on creation/stats endpoints, never on redirects   |
| D1 enforces foreign keys by default; `db.batch()` is atomic                                           | Schema uses `ON DELETE CASCADE`; delete still runs as an explicit atomic batch  |
| Cron Triggers available on free plan                                                                  | One daily cron: salt rotation + purge                                           |
| Turnstile free, with official dummy keys (`1x…AA` sitekey / `1x…AA` secret always pass)               | Used in `.dev.vars.example`, local dev, and CI E2E                              |
| `@cloudflare/vitest-plugin` (successor of `@cloudflare/vitest-pool-workers`) requires **Vitest ^4.1** | Monorepo pins Vitest 4.x                                                        |
| Coverage in workerd: **Istanbul only** (no native V8)                                                 | `@vitest/coverage-istanbul` for the worker package                              |

---

## 2. Data model

SQL migrations in `apps/worker/migrations/`, managed by `wrangler d1 migrations`. Timestamps are ISO-8601 UTC strings (`TEXT`); booleans are `INTEGER` 0/1.

```sql
CREATE TABLE links (
  id          INTEGER PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,          -- 7 chars base62
  target_url  TEXT NOT NULL,
  label       TEXT,                          -- optional, ≤ 100 chars
  secret_hash TEXT NOT NULL,                 -- hex SHA-256 of the secret key
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE scans (
  id              INTEGER PRIMARY KEY,
  link_id         INTEGER NOT NULL REFERENCES links(id) ON DELETE CASCADE,
  scanned_at      TEXT NOT NULL,             -- UTC
  country         TEXT,                      -- ISO 3166-1 alpha-2 from request.cf
  region          TEXT,
  city            TEXT,
  timezone        TEXT,                      -- visitor's IANA tz from request.cf
  as_organization TEXT,
  device_type     TEXT NOT NULL,             -- 'mobile' | 'tablet' | 'desktop' | 'other'
  os              TEXT,                      -- family only, e.g. "iOS" (no version)
  browser         TEXT,                      -- family only
  language        TEXT,                      -- primary tag of Accept-Language, e.g. "fr"
  is_bot          INTEGER NOT NULL DEFAULT 0,
  visitor_hash    TEXT NOT NULL              -- hex SHA-256(daily_salt|slug|ip|ua)
);
CREATE INDEX idx_scans_link_time ON scans (link_id, scanned_at);

CREATE TABLE salts (
  day  TEXT PRIMARY KEY,                     -- 'YYYY-MM-DD' (UTC)
  salt TEXT NOT NULL                         -- 32 random bytes, base64url
);

CREATE TABLE rate_limits (
  key          TEXT NOT NULL,                -- '<scope>:<hashed identifier>'
  window_start INTEGER NOT NULL,             -- epoch seconds, floor to window
  count        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);
```

Privacy invariants (enforced in code + tests):

- **Never stored/logged**: raw IP, full user-agent string, any persistent identifier.
- `visitor_hash = SHA-256(daily_salt + "|" + slug + "|" + ip + "|" + user_agent)`. Salt is created lazily on the first scan of each UTC day (`INSERT OR IGNORE` then `SELECT` — race-safe); old salts deleted by cron ⇒ hashes are unlinkable across days. Unique-visitor counts are therefore **per-day approximations** (documented in the privacy page).
- Rate-limit identifiers are `SHA-256(daily_salt + ip)` — windows never span a salt rotation in a way that matters (max window 1 h).
- Deleting a link runs `db.batch([DELETE scans, DELETE link])` — atomic, and consistent with `ON DELETE CASCADE` as belt-and-braces.

Retention: cron purges scans older than `RETENTION_DAYS` (env var, default 365).

---

## 3. API contract

Base: `https://<worker>.workers.dev`. All bodies validated by shared Zod schemas. Errors are always `{ "error": { "code": string, "message": string } }` with codes like `VALIDATION_ERROR`, `TURNSTILE_FAILED`, `NOT_FOUND`, `UNAUTHORIZED`, `RATE_LIMITED`, `LINK_DISABLED`, `INTERNAL`.

| Method & path                                       | Auth                          | Purpose                                                  |
| --------------------------------------------------- | ----------------------------- | -------------------------------------------------------- |
| `POST /api/links`                                   | Turnstile token + rate limit  | Create link                                              |
| `GET /api/links/:slug`                              | `Authorization: Bearer <key>` | Link metadata (for the management UI)                    |
| `PATCH /api/links/:slug`                            | Bearer key                    | Change `targetUrl` and/or `status` (`active`/`disabled`) |
| `DELETE /api/links/:slug`                           | Bearer key                    | Permanent delete (link + scans)                          |
| `GET /api/links/:slug/stats?from&to&tz&includeBots` | Bearer key                    | Aggregated stats                                         |
| `GET /api/links/:slug/export?from&to&includeBots`   | Bearer key                    | CSV of anonymous scan rows                               |
| `POST /api/admin/links/:slug/status`                | Bearer `ADMIN_TOKEN`          | Kill switch (body `{status}`)                            |
| `GET /r/:slug`                                      | —                             | 302 redirect + async scan recording                      |
| `GET /api/health`                                   | —                             | Liveness (used by E2E setup)                             |

Details:

- **`POST /api/links`** body `{ targetUrl, label?, turnstileToken }` → `201 { slug, shortUrl, secretKey }`. `secretKey` is returned **once**: 32 bytes from `crypto.getRandomValues`, base64url (43 chars). Only its SHA-256 hex is stored. Verification server-side against `https://challenges.cloudflare.com/turnstile/v0/siteverify`.
- **Auth**: key hashed then compared against `secret_hash` with `crypto.subtle.timingSafeEqual`. The key never appears in any URL, path, or query — header only.
- **URL validation** (shared Zod + pure function): `http(s)` only, ≤ 2048 chars, no embedded credentials, hostname not `localhost`/`*.local`/private or loopback IP ranges (IPv4 + IPv6), not the worker's own hostname.
- **Stats response** (computed in SQL, tz-mapped in service): totals (scans, unique visitors, first/last scan), time series per day + per hour (hour series only when range ≤ 14 days), hour-of-day and day-of-week distributions, top 10 of country/city/device/os/browser/language/ISP. `tz` defaults to `Europe/Paris`, validated against `Intl.supportedValuesOf('timeZone')`. `includeBots` defaults to `false`.
- **Timezone strategy**: SQL groups by UTC hour (`strftime`); the service maps each UTC-hour bucket to the requested tz via `Intl.DateTimeFormat` and re-aggregates into local days/hours. Known limitation (documented): counts are exact only for whole-hour-offset zones; 30/45-min-offset zones (e.g. Asia/Kolkata) are off by up to an hour at day boundaries.
- **CSV export**: same columns as the `scans` table minus `id`/`link_id`; downloaded client-side via `fetch` + Blob so the key stays in the header.
- **Redirect**: `302` + `Cache-Control: no-store` (never 301). Unknown slug → 404, disabled → 410, both as friendly HTML pages. Scan recording wrapped in `ctx.waitUntil()` with a top-level catch: tracking failure can never affect the redirect.
- **Bot detection**: `isbot` (Unlicense) **plus** a maintained supplemental regex list covering the previewers the brief names (WhatsApp, Slack, Discord, Facebook, X/Twitter, iMessage/`facebookexternalhit`-style agents, Telegram, search bots), backed by a fixture file of real captured UA strings. Bots are still redirected, flagged `is_bot = 1`, excluded from stats by default.
- **Device/OS/browser**: `ua-parser-js@1` (MIT — v2 is AGPL and excluded). Only coarse families stored, never versions or full UA.
- **Rate limiting** (D1-based, fixed window, in `middleware/` + pure window math in `lib/`): creation 10/h per hashed IP; stats/management 60/min per hashed IP+slug. Failure mode: **fail-closed on writes** (`POST/PATCH/DELETE`), **fail-open on reads** (stats/export) — recorded as ADR. Expired windows purged by the daily cron.
- **CORS**: allowlist = GitHub Pages origin + `http://localhost:5173`. **Security headers** on every response (`X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, minimal CSP on HTML error pages). Web app gets a CSP `<meta>` tag (GitHub Pages can't set headers).
- **Logging**: structured JSON (`console.log(JSON.stringify(...))`), event names + slug + coarse outcome only, never personal data.

---

## 4. Routing

### 4.1 Worker (Hono)

Mounted in `app.ts`: global middleware (security headers → CORS → error boundary) → `/api/links` routes (rate limit + Turnstile or Bearer auth per route) → `/api/admin` (admin auth) → `/r/:slug` → 404 JSON fallback. `scheduled` handler lives beside `fetch` in `index.ts`.

### 4.2 Web (hash routing)

**Decision: `HashRouter`** (React Router v7 in library mode). The fragment is never sent to any server, which both (a) makes deep links work on GitHub Pages with no 404-redirect hack and (b) lets the secret key live in the URL fragment as required.

| Route                | Page                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------ |
| `#/`                 | Create a QR code                                                                     |
| `#/codes`            | "Mes QR codes" (localStorage list + JSON export/import)                              |
| `#/stats`            | Manual slug + key entry                                                              |
| `#/stats/:slug/:key` | Stats dashboard (private link format; also management: edit target, disable, delete) |
| `#/privacy`          | Privacy page                                                                         |

Private stats link: `https://titouanlegourrierec.github.io/qr-tracker/#/stats/<slug>/<key>` — everything after `#` stays in the browser. Vite `base: '/qr-tracker/'`.

QR generation: `qrcode` (MIT) client-side — SVG string + high-res PNG (~1024px, quiet zone, error correction M) rendered from the same data. Charts: **Chart.js v4** (MIT, tree-shakeable via explicit component registration), lazy-loaded with `React.lazy`/dynamic import on the stats route only. Each chart has an accessible `<table>` alternative (WCAG 2.1 AA). All UI strings in `apps/web/src/i18n/en.ts`.

---

## 5. Testing strategy

| Layer                | Tooling                                                                                                                                                  | What                                                                                                                                                                                                                                          |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Worker unit          | Vitest 4 + `@cloudflare/vitest-plugin` (runs in workerd)                                                                                                 | Every `lib/` pure function: slug/key gen, hashing, URL validation, bot detection (fixture UAs per previewer), visitor hash, language parsing, tz bucketing (incl. DST edges), CSV, rate-limit math                                            |
| Worker integration   | Same, `SELF.fetch()` against real local D1 **with migrations applied** in test setup; Turnstile mocked via outbound-fetch mock (always-pass/always-fail) | Every endpoint × happy + error paths: validation, auth failures (bad/missing key, timing path), rate limiting, bot flagging, disabled links, redirect never breaking on tracking failure, cron handler (salt rotation, purge, cascade delete) |
| Web components/hooks | Vitest 4 + Testing Library + MSW                                                                                                                         | Create flow, key-shown-once warning, localStorage list + import/export, stats page states (loading/empty/error), bot toggle, date filter                                                                                                      |
| E2E                  | Playwright against `wrangler dev` (local D1, dummy Turnstile keys) + built SPA via `vite preview`                                                        | Full flow: create → simulated scan (fetch `/r/:slug` with phone UA) → stats shows the scan → change destination → redirect follows → delete → 404                                                                                             |
| Coverage             | `@vitest/coverage-istanbul` (workerd supports Istanbul only)                                                                                             | Thresholds enforced in config: ≥ 90% lines `apps/worker` + `packages/shared`, ≥ 80% `apps/web`                                                                                                                                                |

Test-first for all `lib/` logic. `pnpm check` = format check → lint → typecheck → all unit/integration tests. E2E runs via `pnpm test:e2e` and in CI after build.

---

## 6. Milestones

Each milestone ends with `pnpm check` green + one Conventional Commit.

| #   | Milestone           | Content                                                                                                                                                                                                                                                                                                                                                |
| --- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M0  | Scaffolding         | pnpm workspaces, base tsconfig (`strict` + the 4 extra flags), ESLint flat (ts-eslint strict-type-checked, react-hooks, import order), Prettier, husky + lint-staged + commitlint, `.nvmrc` (Node 24 LTS), `engines`, `packageManager`, `.editorconfig`, Dependabot (weekly, grouped), CI skeleton, root scripts (`vitest --passWithNoTests` until M1) |
| M1  | `packages/shared`   | Zod schemas for every API body/response, error codes, constants; unit tests                                                                                                                                                                                                                                                                            |
| M2  | Worker foundation   | Hono app, `wrangler.jsonc`, D1 migrations, security headers + CORS + error middleware, `/api/health`, vitest-plugin wired with migrations in tests, `.dev.vars.example` (dummy Turnstile keys)                                                                                                                                                         |
| M3  | Links CRUD + auth   | Slug/key generation, Turnstile verify, `POST /api/links`, Bearer-key middleware (constant-time), `GET/PATCH/DELETE /api/links/:slug`, D1 rate limiter                                                                                                                                                                                                  |
| M4  | Redirect + tracking | `GET /r/:slug`, `waitUntil` recording, UA parsing + bot detection + fixtures, visitor hash + salts, error pages; CPU sanity check in `wrangler dev`                                                                                                                                                                                                    |
| M5  | Stats + CSV         | Aggregation SQL + indexes, tz mapping, `GET …/stats`, `GET …/export`                                                                                                                                                                                                                                                                                   |
| M6  | Cron + admin        | `scheduled` handler (salt rotation, scan purge, rate-limit cleanup), admin kill-switch endpoint + `scripts/admin.ts` CLI                                                                                                                                                                                                                               |
| M7  | Web foundation      | Vite + React + HashRouter, `en.ts` strings, mobile-first layout, dark mode, CSP meta, privacy page, API client                                                                                                                                                                                                                                         |
| M8  | Web create flow     | Turnstile widget, QR preview + PNG/SVG download, copy buttons, key-shown-once UI, private-link display, "Mes QR codes" (localStorage + JSON export/import)                                                                                                                                                                                             |
| M9  | Web stats dashboard | Lazy Chart.js, all charts + accessible tables, date range, bot toggle, CSV download, manage panel (edit/disable/delete)                                                                                                                                                                                                                                |
| M10 | E2E + hardening     | Playwright suite, coverage thresholds enforced, a11y pass                                                                                                                                                                                                                                                                                              |
| M11 | CI/CD + docs        | `ci.yml`, `deploy.yml` (migrations → worker → Pages, pinned actions, least-privilege perms), README (Mermaid diagram), DEPLOYMENT.md, ARCHITECTURE.md + 3 ADRs, user-guide.md, CONTRIBUTING, CHANGELOG, CLAUDE.md finalized                                                                                                                            |

---

## 7. Decisions (with rejected alternatives)

1. **`@cloudflare/vitest-plugin` over `@cloudflare/vitest-pool-workers`** (brief named the latter): Cloudflare now documents the plugin as its replacement with an official migration guide. Pins Vitest to 4.x (plugin peer dep `^4.1.0`).
2. **D1-based rate limiter over the Workers Rate Limiting binding**: the binding is per-colo, eventually consistent, limited to 10 s/60 s windows, its free-plan availability is not confirmed anywhere in docs/pricing, and it can't be exercised deterministically in tests. D1 limiter is exact, portable, testable; write volume is trivial on the protected endpoints.
3. **HashRouter over the spa-github-pages 404 trick**: no redirect flash, no fake-404 status, and the secret key naturally lives in the fragment.
4. **`ua-parser-js@1.0.41` (MIT)** — v2 is AGPL, excluded per brief. **`isbot@5` (Unlicense)** + supplemental previewer regexes for coverage of messaging-app previewers.
5. **Chart.js v4** over Recharts (bundle size) and uPlot (accessibility/DX) — tree-shakeable via explicit registration, lazy-loaded.
6. **`qrcode` (MIT)** for client-side PNG + SVG.
7. **Node 24 LTS** pinned (current active LTS; Node 26 not LTS until Oct 2026). Note: Node ≥ 25 no longer bundles Corepack, and this machine runs Node 26 without pnpm — local setup = `nvm use && corepack enable` (Node 24 bundles Corepack) with `npm i -g pnpm` as fallback; CI uses `pnpm/action-setup`.
8. **Zod 4** with `exactOptionalPropertyTypes`: watched gotcha — `.optional()` shapes will be typed/tested carefully.
9. **Malicious-URL reputation check**: feature-flagged stub (`URL_REPUTATION_ENABLED=false` default) with a documented adapter interface; Google Safe Browsing v4 free tier noted as candidate in an ADR, not wired by default (API key + ToS burden on a lab tool).

## 8. Open questions for you

1. **License** — MIT suggested. Confirm?
2. **Plan approval** — any changes before I start M0?
