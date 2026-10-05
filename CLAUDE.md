# CLAUDE.md

QR code generator with anonymous scan analytics. pnpm monorepo: static React SPA on GitHub
Pages + Cloudflare Worker (Hono + D1) on the free tier. Full design: `docs/PLAN.md`.

## Commands

| Command         | What                                                                    |
| --------------- | ----------------------------------------------------------------------- |
| `pnpm dev`      | Worker (`wrangler dev`, :8787) + web (`vite`, :5173) in parallel        |
| `pnpm check`    | format:check → lint → typecheck → tests (must pass before every commit) |
| `pnpm test:e2e` | Playwright (boots worker with fresh D1 + builds/serves SPA on :4173)    |
| `pnpm build`    | Build all packages                                                      |

## Conventions

- Conventional Commits (enforced by commitlint). One commit per milestone minimum.
- Everything is **English** — code, comments, commits, docs and UI strings. UI strings
  are centralized in `apps/web/src/i18n/en.ts`. User guide: `docs/user-guide.md`.
- Never disable lint rules / skip tests / use `any` / `@ts-ignore` / `@ts-expect-error` to
  make checks pass. Justify any truly unavoidable exception inline.
- Worker layering: routes → services → repositories; pure logic in `src/lib/` (unit-tested).
- All API bodies validated with Zod schemas from `@qr-tracker/shared` (single source of truth).
- Errors: `{ "error": { "code": string, "message": string } }`.

## Architecture summary

- `packages/shared` — Zod schemas, types, constants. Consumed as TypeScript source
  (`exports` → `./src/index.ts`); bundlers (wrangler, vite, vitest) compile it directly.
- `apps/worker` — Hono routes; D1 via Wrangler migrations (`apps/worker/migrations/`);
  daily cron (salt rotation, scan purge, rate-limit cleanup). Redirect: `GET /r/:slug` →
  302 + `Cache-Control: no-store`, scan recorded in `ctx.waitUntil()`.
- `apps/web` — Vite + React SPA, **HashRouter** (`#/stats/:slug/:key` — the secret key must
  only ever live in the URL fragment). Vite `base: '/qr-tracker/'`.

## Gotchas

- **TypeScript is pinned to 6.0.x**: typescript-eslint peer range is `>=4.8.4 <6.1.0`
  (TS 7 = Go rewrite, unsupported). Don't bump TS without checking typescript-eslint.
- **Vitest is pinned to 4.1.11 exactly**: `@cloudflare/vitest-plugin` requires `^4.1.0`
  and `@vitest/coverage-istanbul` pins its peer exactly. Don't bump to Vitest 5.
- Coverage in workerd only works with the **istanbul** provider (no native V8 coverage).
- `ua-parser-js` must stay on **v1.x** (MIT); v2 is AGPL and prohibited.
- Privacy invariants: never store or log raw IPs, full user-agent strings, or any
  persistent identifier. Visitor hashes use a daily rotated salt.
- Node ≥ 25 does not bundle Corepack. Local setup: Node 24 (`.nvmrc`) or `npm i -g pnpm`.
- Node ≥ 25 also ships an experimental global `localStorage` that shadows jsdom's in web
  tests — `apps/web/test/setup.ts` restores the real one; use `window.localStorage` in code.
- Destinations are stored as `validateTargetUrl(...).url.href`, never the raw input
  (`https:/host` passes validation but resolves against the worker in `Location`).
- Workers invocation logs are off on purpose (`wrangler.jsonc`): they would log IPs and
  user-agents. Never pass personal data to `log()`/`logError()` either — including abuse
  report details (free text), which also stay out of CI logs (`admin.mjs --fail-if-any`).
- Link status is three-valued: `active` / `disabled` (owner) / `blocked` (admin only —
  the owner API cannot set or clear it; redirect serves 410 for both non-active states).
- react-hooks v7 lint (React Compiler rules): no synchronous setState inside effects, no
  property access on hook-returned objects holding refs during render (destructure them).
- If an E2E run is interrupted, orphaned servers can block ports 8787/4173. Clean with:
  `pkill -f "wrangler.js dev"; pkill -f workerd; lsof -ti :4173 | xargs kill -9`
  (a plain `pkill -f "wrangler dev"` does NOT match the real command line).
- An empty `VITE_API_URL`/`VITE_TURNSTILE_SITE_KEY` falls back to localhost/test-key with
  a build warning (first-deploy circularity: the worker URL exists only after deploy #1).
- Turnstile dev/test keys (always pass): sitekey `1x00000000000000000000AA`,
  secret `1x0000000000000000000000000000000AA` (see `.dev.vars.example`).
