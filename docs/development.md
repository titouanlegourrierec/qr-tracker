# Development

How to run QR Tracker locally, the commands, the code layout and the tests. The rules for a
change are in [CONTRIBUTING.md](../CONTRIBUTING.md); how the system works is in
[ARCHITECTURE.md](ARCHITECTURE.md).

## Setup

```bash
# Node 24 (.nvmrc) ships Corepack:
corepack enable        # on Node >= 25, which does not: npm i -g pnpm
pnpm install
pnpm dev               # worker http://localhost:8787 + web http://localhost:5173/qr-tracker/
```

`pnpm dev` applies the D1 migrations to a local database, and creates
`apps/worker/.dev.vars` from `.dev.vars.example` (`apps/worker/scripts/ensure-dev-vars.mjs`):
Cloudflare's Turnstile _test_ keys, a local `ADMIN_TOKEN` and the local origins allowed to
call the API, which production does not allow. Creating a QR code works at once, offline.
Settings added to the example later are appended to an existing `.dev.vars` on the next
`pnpm dev`, without touching the values already there.

## Commands

| Command                                                      | What                                                                |
| ------------------------------------------------------------ | ------------------------------------------------------------------- |
| `pnpm dev`                                                   | Worker (`wrangler dev`, :8787) + web (`vite`, :5173) in parallel    |
| `pnpm check`                                                 | Format check → lint → typecheck → licenses → unit/integration tests |
| `pnpm test:e2e`                                              | Playwright end-to-end suite (boots the worker, builds the web app)  |
| `pnpm build`                                                 | Build all packages                                                  |
| `pnpm format` / `pnpm lint` / `pnpm typecheck` / `pnpm test` | Individual steps (Prettier, type-checked ESLint flat config, …)     |
| `pnpm licenses:check`                                        | Dependency license gate (`scripts/check-licenses.mjs`)              |

`pnpm check` must pass before every commit; husky and lint-staged run on staged files and
commitlint enforces Conventional Commits. The operator commands (`scripts/admin.mjs`) are in
[DEPLOYMENT.md §11](DEPLOYMENT.md#11-abuse-handling).

## Code layout

```
apps/worker/       Cloudflare Worker: routes → services → repositories, lib/ pure functions,
                   middleware/, migrations/, tests in the real workerd runtime
apps/web/          React SPA: pages/, components/, i18n/en.ts (every UI string), MSW tests
packages/shared/   Zod schemas, types and constants: the single API contract
e2e/               Playwright suite: full lifecycle, stats entry, read-only link, reports
docs/              Architecture, deployment and operations, ADRs, user guide
scripts/           admin.mjs (operator CLI), check-licenses.mjs, check-usage.mjs (Monitor)
```

`packages/shared` is consumed as TypeScript source: wrangler, Vite and Vitest compile it
directly. An API change starts there; both apps follow.

## Tests

| Layer       | Tooling                                                                    | Covers                                                                                                                                    |
| ----------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Worker unit | Vitest 4 + `@cloudflare/vitest-plugin` (runs in workerd)                   | Every `lib/` function: keys and hashing, URL validation, bot detection (fixture user-agents), timezone bucketing (DST edges), CSV, limits |
| Worker API  | Same, `SELF.fetch()` against a local D1 with the migrations applied        | Every endpoint, happy and error paths: auth, rate limits, disabled and blocked links, redirect surviving tracking failures, the cron      |
| Web         | Vitest 4 + Testing Library + MSW (jsdom)                                   | Pages and components: create flow, one-time key, "My QR codes", stats states, filters, management                                         |
| End-to-end  | Playwright against `wrangler dev` (fresh local D1) + the built SPA (:4173) | Create → scan → stats → edit → disable → delete, the read-only link and a report, on desktop Chrome, mobile Safari and mobile Chrome      |

- Coverage uses the **istanbul** provider (workerd has no native V8 coverage). Thresholds,
  enforced: ≥ 90 % lines for the worker and `packages/shared`, ≥ 80 % for the web app.
- Install the E2E browsers once: `pnpm exec playwright install chromium webkit`. The three
  projects share one local IP, so `playwright.config.ts` starts the worker with
  `--var RATE_LIMIT_MULTIPLIER:10` (production keeps 1).
- An interrupted E2E run can leave servers on ports 8787/4173:
  `pkill -f "wrangler.js dev"; pkill -f workerd; lsof -ti :4173 | xargs kill -9`.

## Tech stack

TypeScript (strict) everywhere, pnpm workspaces.

- **Worker**: Hono, D1 with Wrangler migrations, Zod, `isbot` + `ua-parser-js` 1.x (MIT; v2
  is AGPL and refused).
- **Web**: Vite, React 19, React Router (hash routing), `qrcode`, Chart.js and an SVG world
  map (d3-geo + topojson-client), both lazy-loaded, Inter (self-hosted).
- **Tooling**: ESLint (type-checked) + Prettier, husky, lint-staged, commitlint, a license
  gate, Dependabot, CI and deploy workflows, an hourly production monitor.

Pinned on purpose (`.github/dependabot.yml` holds back the breaking updates): TypeScript
6.0.x (typescript-eslint's peer range stops below 6.1), Vitest 4.1.x
(`@cloudflare/vitest-plugin` requires ^4.1 and `@vitest/coverage-istanbul` pins its peer
exactly, so they move together) and `ua-parser-js` 1.x. Node ≥ 25 also ships an
experimental global `localStorage` that shadows jsdom's in web tests:
`apps/web/test/setup.ts` restores the real one, and code uses `window.localStorage`.
