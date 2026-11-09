# Deployment and operations

From zero to a working deployment (§1–§8), then running it: releases, floods, abuse,
monitoring and backups (§9–§13). Everything runs on **free tiers**: Cloudflare Workers, D1
and Turnstile, and GitHub Pages. You need a GitHub account holding this repository and a
free Cloudflare account.

The guide uses this repository's addresses. In a fork, replace
`titouanlegourrierec.github.io` with your Pages origin in `apps/worker/wrangler.jsonc`
(`ALLOWED_ORIGINS`, `WEB_APP_URL`) and `.github/workflows/monitor.yml` (`SITE_URL`), and
the publisher in the footer and legal notice (`apps/web/src/i18n/en.ts`,
`apps/web/src/pages/LegalPage.tsx`, `CONTACT_EMAIL` in `apps/web/src/config.ts`).

---

## 1. Cloudflare account

1. Create a free account at <https://dash.cloudflare.com/sign-up> (no domain needed).
2. Note your **Account ID**: Workers & Pages shows it in the URL and the right sidebar.

## 2. Create the D1 database

Once, on your machine, after `pnpm install`:

```bash
cd apps/worker
pnpm exec wrangler login
pnpm exec wrangler d1 create qr-tracker-db
```

Copy the printed `database_id` (a UUID) into
[apps/worker/wrangler.jsonc](../apps/worker/wrangler.jsonc) in place of the current one,
and commit.

## 3. Create the Turnstile widget

Dashboard → **Turnstile** → _Add site_: name `qr-tracker`, domain
`titouanlegourrierec.github.io` (add `localhost` to test a production build locally), mode
**Managed**. Note the **Site key** (public) and the **Secret key** (private).

## 4. Create a Cloudflare API token (least privilege)

Dashboard → My profile → **API Tokens** → _Create Token_ → _Create Custom Token_, with:

- **Account → Workers Scripts → Edit**;
- **Account → D1 → Edit**;
- **Account → Account Analytics → Read**: read-only, lets the hourly _Monitor_ workflow
  warn you before a free-plan quota runs out (§12).

Account Resources: include → your account; leave the rest at defaults. Copy the token: it
is shown once.

## 5. Set the worker secrets

```bash
cd apps/worker
pnpm exec wrangler secret put TURNSTILE_SECRET_KEY   # the Turnstile SECRET key
pnpm exec wrangler secret put ADMIN_TOKEN            # a long random string:
# openssl rand -base64 32
```

Keep `ADMIN_TOKEN` somewhere safe: it drives the kill switch and the report queue
(`node scripts/admin.mjs`, §11), where the optional `SAFE_BROWSING_API_KEY` is covered too.

## 6. GitHub repository configuration

Repository → **Settings**:

1. **Secrets and variables → Actions → Secrets**: `CLOUDFLARE_API_TOKEN` (step 4) and
   `CLOUDFLARE_ACCOUNT_ID` (step 1).
2. **Secrets and variables → Actions → Variables**:
   - `VITE_API_URL`: the worker URL, `https://qr-tracker.<your-subdomain>.workers.dev`. It
     exists only after the first deploy (step 7; also shown under Workers & Pages →
     qr-tracker).
   - `VITE_TURNSTILE_SITE_KEY`: the Turnstile **Site key** (step 3).
3. **Pages** → _Build and deployment_ → Source: **GitHub Actions**.

## 7. First deployment

Push to `main` (or re-run the _Deploy_ workflow). It runs the checks and the end-to-end
tests, applies the D1 migrations to the remote database, deploys the worker, then builds
the web app with your variables and publishes it to GitHub Pages. Open
`https://titouanlegourrierec.github.io/qr-tracker/` and create a first QR code.

On the very first run `VITE_API_URL` cannot exist yet: the build falls back to
`http://localhost:8787` with a warning. Read the worker URL from the deploy job (or the
dashboard), set the variable, and re-run _Deploy_.

## 8. Optional: custom domain

- **Worker**: Workers & Pages → qr-tracker → Settings → Domains & Routes → add a custom
  domain (the domain must be on Cloudflare). Then update `VITE_API_URL` and add the new
  origin to `ALLOWED_ORIGINS` in `wrangler.jsonc`.
- **Web**: GitHub Pages → custom domain (see GitHub's docs). Then add that origin to
  `ALLOWED_ORIGINS`, set Vite `base` to `/` in `apps/web/vite.config.ts`, and update
  `WEB_APP_URL` (`wrangler.jsonc`) and `SITE_URL` (`monitor.yml`).

## 9. Releases and rollback

Every push to `main` reaches production once the checks and the end-to-end tests pass:
_Deploy_ runs both before touching production (_CI_ runs them on pull requests), and ends
with a smoke test against production (worker health, the 404 page for an unknown code, the
web app wired to the worker). A release is a tagged, documented point in that history.

**Cutting a release** ([Semantic Versioning](https://semver.org/)):

1. Move the `[Unreleased]` entries of `CHANGELOG.md` under a new `[X.Y.Z] - date` heading
   and set `version` to `X.Y.Z` in the four `package.json` files.
2. Commit as `chore(release): X.Y.Z`, push, and wait for _Deploy_ to be green.
3. Tag that commit and publish the release notes:

   ```bash
   git tag -a vX.Y.Z -m "QR Tracker vX.Y.Z"
   git push origin vX.Y.Z
   gh release create vX.Y.Z --title "vX.Y.Z" --notes-file release-notes.md --verify-tag
   ```

**Rolling back**:

- **Worker only, instantly**: in `apps/worker/`, `npx wrangler deployments list` shows each
  deployed version (its message is the commit SHA) and `npx wrangler rollback <version-id>`
  puts one back. Code only: the D1 schema is not rolled back.
- **Worker and web app**: `git revert` the offending commits on `main` and push. For up to
  30 days you can instead re-run the _Deploy_ run of a known-good commit
  (`gh run rerun <run-id>`). Deploying a tag or another branch is refused: the
  `github-pages` environment only accepts `main`.
- **Migrations are forward-only**: keep them additive (tables, columns, indexes) so that an
  older worker keeps working against a newer schema.
- **Exception, below 1.3.0**: migration 0004 drops `scans.as_organization`, which older
  workers read and write. Before rolling the worker back that far, put an empty column back,
  `npx wrangler d1 execute qr-tracker-db --remote --command "ALTER TABLE scans ADD COLUMN as_organization TEXT"`,
  and roll the web app back too: an old worker fills `topIsps`, which the 1.3.0 web app
  expects empty. (Migration 0005's `view_hash` is additive and harmless.)

## 10. Protecting the redirect from floods

On the free plan every quota is a hard daily cutoff (reset at 00:00 UTC): 100,000 Worker
requests, 100,000 D1 rows written (a scan writes about 2) and 5,000,000 D1 rows read. One
script hammering `/r/<slug>` can exhaust them, and the worker cannot stop it: a request it
rejects has already been counted.

On its own, the worker keeps redirecting when D1 fails (outage or exhausted quota): it falls
back to the last state its isolate saw for the slug (`src/services/redirect.ts`), so
recently scanned codes keep working, without recording scans; unknown slugs get a 503 page
with `Retry-After`.

Real protection needs a purchase:

- **Custom domain + WAF rate limiting rule**: the free plan includes one rule, but rules
  apply to a zone, not to `workers.dev`. Blocked requests never reach the worker and
  consume no quota. Security → WAF → Rate limiting rules → create:
  - when _URI Path_ starts with `/r/` (the free plan allows only the path field);
  - characteristics IP; period and mitigation timeout 10 seconds (the only free values);
    action Block;
  - threshold around 20 requests per 10 seconds, with headroom: a crowd behind one
    carrier-grade NAT (event, campus) shares a single IP.
- **Workers Paid** ($5/month): 10 million requests and 50 million D1 rows written per month
  included, billed beyond instead of cut off. The only protection against a distributed
  flood.

Print QR codes at scale only once their domain is final: every printed code contains the
worker's hostname forever.

## 11. Abuse handling

A public QR code service attracts phishing. If a browser vendor or Cloudflare flags the
worker's domain, every QR code shows a warning page, so handle reports quickly
([ADR 0004](adr/0004-abuse-handling.md)).

**Reputation check (Google Safe Browsing).** With `URL_REPUTATION_ENABLED` at `"true"` (the
default in `wrangler.jsonc`), every destination is checked on creation and on each change,
once the API key exists; until then the check is skipped and the worker logs
`url_reputation_skipped`. It fails open: if the API is down, links are still created.

1. In the [Google Cloud console](https://console.cloud.google.com/), create a project,
   enable the **Safe Browsing API** and create an API key restricted to it. That API is for
   non-commercial use; a commercial service would need Web Risk.
2. Store it as a worker secret:

   ```bash
   cd apps/worker
   pnpm exec wrangler secret put SAFE_BROWSING_API_KEY
   ```

Refused destinations get `TARGET_URL_INVALID`; the worker logs `url_reputation_match` with
the host and threat types.

**Reports.** Anyone can report a code from the web app's _Report abuse_ page; the worker's
`/` and `/report` lead there, for people who only know the short-link domain. Triage:

```bash
export ADMIN_TOKEN=... WORKER_URL=https://qr-tracker.<account>.workers.dev
node scripts/admin.mjs reports            # newest first, grouped by link
node scripts/admin.mjs disable <slug>     # block it (the owner cannot lift a block)
node scripts/admin.mjs dismiss <slug>     # clear its reports once handled
```

Reports are deleted with their link and purged after `RETENTION_DAYS`.

**Notification.** The worker cannot send e-mail on the free plan. Instead the daily _Abuse
reports_ workflow fails while reports are waiting, and GitHub e-mails you about the failed
run. Its logs show counts only, never report contents. Enable it once with
`gh secret set ADMIN_TOKEN` (the worker's value); it reads the worker URL from the
`VITE_API_URL` variable (§6). Without the secret, the job succeeds with a notice and checks
nothing.

## 12. Monitoring and alerts

The _Monitor_ workflow (`.github/workflows/monitor.yml`) runs every hour. A run fails, and
GitHub e-mails you, when one of these checks does:

- the worker answers (`/api/health`);
- the database answers: an unknown QR code gets the 404 page (a 503 means D1 is failing,
  usually an exhausted daily quota);
- the web app is served and points to the worker;
- the free plan's daily quotas (account-wide, reset at 00:00 UTC) stay below **70 %** for
  Worker requests, D1 rows read and D1 rows written, leaving time to react (§10). Each
  run's summary shows today's figures.

The quota check reads the Cloudflare GraphQL Analytics API with the `CLOUDFLARE_API_TOKEN`
secret, which needs **Account → Account Analytics → Read** (§4). Without it the step only
warns "Cloudflare usage is not readable" and the uptime checks still run. To add it:
Dashboard → My profile → API Tokens → the token → _Edit_ → add the permission → _Continue to
summary_ → _Update token_; the secret keeps its value.

Run it by hand with `gh workflow run monitor.yml`. While the repository is private, each run
costs about one of the 2,000 free Actions minutes per month (about 720 a month); public
repositories do not pay for Actions minutes. GitHub's scheduler can start runs late, and
pauses scheduled workflows after 60 days without commits: re-enable it from the Actions tab.
For alerts within minutes, add an external uptime service (e.g. UptimeRobot's free plan)
expecting a 404 from `https://qr-tracker.<your-subdomain>.workers.dev/r/zzzzzzz`.

## 13. Backups and restore

**D1 Time Travel** keeps the database's history with no setup: the last **7 days** on the
free plan (30 on Workers Paid), restorable to any minute.

```bash
cd apps/worker
# Where would a restore go? (prints the bookmark for that moment)
pnpm exec wrangler d1 time-travel info qr-tracker-db --timestamp=2026-11-01T12:00:00Z
# Restore the whole database to that moment
pnpm exec wrangler d1 time-travel restore qr-tracker-db --timestamp=2026-11-01T12:00:00Z
```

A restore **replaces the whole database**: links and scans created after that moment are
lost. It prints a bookmark of the state just before; `time-travel restore … --bookmark=<it>`
undoes it. The worker's code is untouched: if a release changed the schema since that
moment, roll the worker back too (§9).

**Off-site copy**, e.g. before a risky migration:

```bash
pnpm exec wrangler d1 export qr-tracker-db --remote --output=backup-$(date +%F).sql
```

The file holds the key hashes, every destination and the reports' free text: keep it
private and outside the repository. To load it into a new, empty database:
`wrangler d1 execute <database> --remote --file=backup-….sql`.

## Troubleshooting

| Symptom                                    | Fix                                                                                                 |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Deploy job fails on migrations             | Check `database_id` in wrangler.jsonc and the API token's D1 permission                             |
| Web app shows "Could not reach the server" | `VITE_API_URL` variable wrong/missing, or the Pages origin is missing from `ALLOWED_ORIGINS`        |
| Turnstile widget shows an error            | Site key/domain mismatch: the widget's domain list must include `titouanlegourrierec.github.io`     |
| Creation always returns TURNSTILE_FAILED   | `TURNSTILE_SECRET_KEY` secret not set on the worker, or site/secret keys are from different widgets |
| 403 on admin CLI                           | `ADMIN_TOKEN` secret differs from the one you pass to the script                                    |
| Monitor warns "usage is not readable"      | Add **Account Analytics → Read** to the Cloudflare API token (§4, §12)                              |
