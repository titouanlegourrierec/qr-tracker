# Contributing

Bug reports and ideas are welcome as
[issues](https://github.com/titouanlegourrierec/qr-tracker/issues); report a vulnerability
privately instead ([SECURITY.md](SECURITY.md)). To change the code, set it up with
[docs/development.md](docs/development.md) and read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
first: the worker follows routes → services → repositories with pure helpers in `lib/`, and
the API contract lives in `packages/shared` (Zod schemas), so a change starts there.

## Rules

- **Conventional Commits**, enforced by commitlint (`feat:`, `fix:`, `docs:`, `chore:`…).
- `pnpm check` must pass before every commit (husky + lint-staged run on staged files).
- Never silence a lint rule, skip a test, or use `any` / `@ts-ignore` / `@ts-expect-error`
  to get checks green. A truly unavoidable exception needs an inline justification.
- Tests come with the code: pure logic in `src/lib/` gets unit tests, endpoints integration
  tests in the real Workers runtime, UI Testing Library + MSW tests. Coverage thresholds
  are enforced ([docs/development.md](docs/development.md#tests)).
- Every user-facing string lives in `apps/web/src/i18n/en.ts`, so another language can be
  added later. Code, comments, commits and docs are in English.
- The privacy invariants are non-negotiable: never store or log a raw IP, a full
  user-agent or any persistent identifier
  ([ADR 0003](docs/adr/0003-privacy-visitor-hashing.md)).
- Dependency licenses are checked by `pnpm check` (`scripts/check-licenses.mjs`): code
  shipped to visitors or run by the worker must be permissively licensed, and AGPL/GPL are
  never accepted. A new license is added there, with the reason, in the same PR.

## Dependency updates

Dependabot opens one weekly PR with all minor and patch updates, and one PR per major
update, labelled **major update** with a warning comment, since it can break things:

- Merge only when every check is green. A red check means the code must be adapted first
  (e.g. msw 3 renamed `onUnhandledRequest` to `onUnhandledFrame`).
- Merge Dependabot PRs one at a time and let Dependabot rebase the next one: merging two PRs
  that both touched `pnpm-lock.yaml` once left the lockfile inconsistent.
- TypeScript (6.0.x), Vitest (4.1.x) and ua-parser-js (1.x) are pinned on purpose
  ([docs/development.md](docs/development.md#tech-stack)); Dependabot holds back the updates
  that would break them.
