# Contributing

## Setup

```bash
# Node 24 (see .nvmrc). Corepack ships with Node 24:
corepack enable
# (on Node >= 25, Corepack is not bundled: npm i -g pnpm)
pnpm install
pnpm dev        # worker on :8787 (migrations auto-applied) + web on :5173
```

`apps/worker/.dev.vars` is created automatically from `.dev.vars.example` with
Cloudflare's Turnstile _test_ keys — creation works offline-locally out of the box.

## Commands

| Command                     | What                                                               |
| --------------------------- | ------------------------------------------------------------------ |
| `pnpm check`                | format check → lint → typecheck → all unit/integration tests       |
| `pnpm test:e2e`             | Playwright end-to-end suite (builds the web app, boots the worker) |
| `pnpm format` / `pnpm lint` | Prettier / ESLint (flat config, type-checked)                      |
| `pnpm build`                | Build all packages                                                 |

## Rules

- **Conventional Commits** — enforced by commitlint (`feat:`, `fix:`, `docs:`, `chore:`…).
- `pnpm check` must pass before every commit (husky + lint-staged run on staged files).
- Never silence a lint rule, skip a test, or use `any` / `@ts-ignore` / `@ts-expect-error`
  to get checks green. A truly unavoidable exception needs an inline justification.
- Tests accompany the code: pure logic in `src/lib/` is unit-tested; endpoints get
  integration tests in the real Workers runtime; UI gets Testing Library + MSW tests.
- Coverage thresholds are enforced: ≥ 90% lines (worker, shared), ≥ 80% (web).
- All user-facing strings live in `apps/web/src/i18n/en.ts` (centralized so another
  language can be added later). Code, comments, commits and docs are English.
- Privacy invariants (never store/log raw IPs, full user-agents, or any persistent
  identifier) are non-negotiable — see `docs/adr/0003-privacy-visitor-hashing.md`.

## Dependency updates

Dependabot opens one weekly PR with all minor and patch updates, and one PR per major
update, labelled **major update** with a warning comment. A major update can contain
breaking changes:

- Merge only when every check is green. A red check means the code must be adapted first
  (e.g. msw 3 renamed `onUnhandledRequest` to `onUnhandledFrame`).
- Merge Dependabot PRs one at a time and let Dependabot rebase the next one: merging two
  PRs that both touched `pnpm-lock.yaml` once left the lockfile inconsistent.
- TypeScript (6.0.x), Vitest (4.1.x) and ua-parser-js (1.x) are pinned and ignored by
  Dependabot; see CLAUDE.md before bumping them.

## Architecture

Read `docs/ARCHITECTURE.md` first; the worker follows routes → services → repositories,
with pure helpers in `lib/`. The API contract lives in `packages/shared` (Zod schemas) —
change it there first, both apps consume it.
