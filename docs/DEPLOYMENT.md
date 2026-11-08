# Deployment guide

Step-by-step guide from zero to a working deployment, for a non-expert. Everything runs on
**free tiers**: Cloudflare Workers + D1 + Turnstile, and GitHub Pages.

You will need: a GitHub account (this repository pushed to
`github.com/titouanlegourrierec/qr-tracker`) and a free Cloudflare account.

---

## 1. Cloudflare account

1. Create a free account at <https://dash.cloudflare.com/sign-up> (no domain needed).
2. Note your **Account ID**: dashboard → any page → right sidebar, or
   <https://dash.cloudflare.com> → Workers & Pages → the ID is in the URL and the sidebar.

## 2. Create the D1 database

On your machine (one-time, needs `pnpm install` done and a browser login):

```bash
cd apps/worker
pnpm exec wrangler login
pnpm exec wrangler d1 create qr-tracker-db
```

The command prints a `database_id` (a UUID). **Copy it into
[apps/worker/wrangler.jsonc](../apps/worker/wrangler.jsonc)**, replacing the
`00000000-...` placeholder. Commit that change.

## 3. Create the Turnstile widget

1. Dashboard → **Turnstile** → _Add site_.
2. Site name: `qr-tracker`. Domain: `titouanlegourrierec.github.io`.
   Also add `localhost` if you want to test a production build locally.
3. Widget mode: **Managed** (recommended).
4. Note the **Site key** (public) and the **Secret key** (private).

## 4. Create a Cloudflare API token (least privilege)

1. Dashboard → My profile → **API Tokens** → _Create Token_ → _Create Custom Token_.
2. Permissions:
   - **Account → Workers Scripts → Edit**
   - **Account → D1 → Edit**
   - **Account → Account Analytics → Read** — read-only; lets the hourly _Monitor_
     workflow warn you before a free-plan quota runs out (§12).
3. Account Resources: include → your account. Keep everything else at defaults.
4. Create and copy the token (shown once).

## 5. Set the worker secrets

```bash
cd apps/worker
pnpm exec wrangler secret put TURNSTILE_SECRET_KEY   # paste the Turnstile SECRET key
pnpm exec wrangler secret put ADMIN_TOKEN            # paste a long random string, e.g.:
# generate one:  openssl rand -base64 32
```

Keep the `ADMIN_TOKEN` value somewhere safe — it drives the abuse kill switch and the
report queue (`node scripts/admin.mjs`, see §11). The optional `SAFE_BROWSING_API_KEY`
secret is covered in §11 too.

## 6. GitHub repository configuration

Repository → **Settings**:

1. **Secrets and variables → Actions → Secrets** (_New repository secret_):
   - `CLOUDFLARE_API_TOKEN` — the token from step 4.
   - `CLOUDFLARE_ACCOUNT_ID` — your account ID from step 1.
2. **Secrets and variables → Actions → Variables** (_New repository variable_):
   - `VITE_API_URL` — your worker URL, `https://qr-tracker.<your-subdomain>.workers.dev`
     (shown after the first worker deploy; you can also read it in the dashboard under
     Workers & Pages → qr-tracker. Set it after step 7 and re-run the deploy if needed).
   - `VITE_TURNSTILE_SITE_KEY` — the Turnstile **Site key** (public) from step 3.
3. **Pages**: Settings → Pages → _Build and deployment_ → Source: **GitHub Actions**.

## 7. First deployment

Push to `main` (or re-run the _Deploy_ workflow under Actions). The workflow:

1. re-runs all checks,
2. applies the D1 migrations to the remote database,
3. deploys the worker,
4. builds the web app with your variables and publishes it to GitHub Pages.

Then open `https://titouanlegourrierec.github.io/qr-tracker/` and create a first QR code. 🎉

If `VITE_API_URL` was not yet set on the very first run: check the worker URL printed by
the deploy job (or the dashboard), set the variable, and re-run the _Deploy_ workflow.

## 8. Optional: custom domain

- **Worker**: Workers & Pages → qr-tracker → Settings → Domains & Routes → add a custom
  domain (requires the domain to be on Cloudflare). Then update `VITE_API_URL` and add the
  new origin to `ALLOWED_ORIGINS` in `wrangler.jsonc`.
- **Web**: GitHub Pages → custom domain (see GitHub docs). Then add that origin to
  `ALLOWED_ORIGINS`, and set Vite `base` to `/` in `apps/web/vite.config.ts`.

## 9. Releases and rollback

Every push to `main` is deployed to production once the checks and the end-to-end tests
pass (the _Deploy_ workflow runs both before touching production; _CI_ runs them on pull
requests). The _Deploy_ workflow ends with a smoke test against production (worker health, the 404 page for an
unknown code, and the web app wired to the worker). A release is a tagged, documented
point in that history that you can return to.

**Cutting a release** ([Semantic Versioning](https://semver.org/)):

1. Move the `[Unreleased]` entries of `CHANGELOG.md` under a new `[X.Y.Z] - date`
   heading and set `version` to `X.Y.Z` in the four `package.json` files.
2. Commit as `chore(release): X.Y.Z`, push, and wait for _Deploy_ to be green.
3. Tag that commit and publish the release notes:

   ```bash
   git tag -a vX.Y.Z -m "QR Tracker vX.Y.Z"
   git push origin vX.Y.Z
   gh release create vX.Y.Z --title "vX.Y.Z" --notes-file release-notes.md --verify-tag
   ```

**Rolling back**:

- **Worker only, instantly**: in `apps/worker/`, `npx wrangler deployments list` shows
  each deployed version (its message is the commit SHA), and
  `npx wrangler rollback <version-id>` puts one back. This restores code only — the D1
  schema is not rolled back.
- **Worker and web app**: `git revert` the offending commits on `main` and push; the
  pipeline redeploys the previous state. For up to 30 days you can instead re-run the
  _Deploy_ run of a known-good commit (`gh run rerun <run-id>`). Deploying a tag or
  another branch directly is refused: the `github-pages` environment only accepts `main`.
- **Migrations are forward-only**: keep them additive (new tables, columns, indexes) so
  that an older worker keeps working against a newer schema.
- **Exception — below 1.3.0**: migration 0004 drops `scans.as_organization` (the ISP is no
  longer collected). A worker older than 1.3.0 reads and writes that column, so before
  rolling the worker back that far, put an empty column back:
  `npx wrangler d1 execute qr-tracker-db --remote --command "ALTER TABLE scans ADD COLUMN as_organization TEXT"`.
  Roll the web app back too: an old worker fills `topIsps`, which the 1.3.0 web app
  expects empty. (Adding `view_hash` in 0005 is additive and harmless.)

## 10. Protecting the redirect from floods

On the free plan every quota is a hard daily cutoff (reset at 00:00 UTC): 100,000 Worker
requests, 100,000 D1 rows written (a scan writes about 2) and 5,000,000 D1 rows read. A
single script hammering `/r/<slug>` can exhaust them, and nothing inside the worker can
stop that: a request the worker rejects has already been counted.

What the worker does on its own:

- If D1 fails (outage or exhausted quota), the redirect falls back to the last state this
  isolate saw for the slug (`src/services/redirect.ts`), so recently scanned QR codes keep
  working; scans are simply not recorded meanwhile. Unknown slugs get a 503 page with
  `Retry-After` instead of a raw error.

What only you can decide (both need a purchase):

- **Custom domain + WAF rate limiting rule** (the free plan includes 1 rule, but rules only
  apply to a zone, not to `workers.dev`). Requests blocked by the WAF never reach the
  worker, so they consume no quota. Security → WAF → Rate limiting rules → create:
  - when: field _URI Path_ starts with `/r/` (the free plan only allows the path field);
  - characteristics: IP; period and mitigation timeout: 10 seconds (the only free values);
    action: Block;
  - threshold: start around 20 requests per 10 seconds. Keep headroom: a crowd behind one
    carrier-grade NAT (event, campus) shares a single IP.
- **Workers Paid** ($5/month): 10 million requests and 50 million D1 rows written per
  month included, billed beyond instead of cut off. This is the only protection against a
  distributed flood.

Print QR codes at scale only once the domain they will encode is final: every printed code
contains the worker's hostname forever.

## 11. Abuse handling

A public QR code service attracts phishing. If a browser vendor or Cloudflare flags the
worker's domain, every QR code shows a warning page, so handle reports quickly.

**Reputation check (Google Safe Browsing).** With `URL_REPUTATION_ENABLED` set to `"true"`
(the default in `wrangler.jsonc`), every destination is checked on creation and on each
change of destination, but only once the API key exists. Until then the check is skipped
and the worker logs `url_reputation_skipped`. The check fails open: if the API is down,
links are still created.

1. In the [Google Cloud console](https://console.cloud.google.com/), create a project,
   enable the **Safe Browsing API**, and create an API key restricted to that API.
   The Safe Browsing API is for non-commercial use; a commercial service would need Web Risk.
2. Store it as a worker secret:

   ```bash
   cd apps/worker
   pnpm exec wrangler secret put SAFE_BROWSING_API_KEY
   ```

Refused destinations get `TARGET_URL_INVALID`, and the worker logs `url_reputation_match`
with the host and threat types.

**Reports.** Anyone can report a code from the web app's _Report abuse_ page. The worker's
`/` and `/report` redirect there, for people who only know the short-link domain. Triage:

```bash
export ADMIN_TOKEN=... WORKER_URL=https://qr-tracker.<account>.workers.dev
node scripts/admin.mjs reports            # newest first, grouped by link
node scripts/admin.mjs disable <slug>     # block it (the owner cannot lift a block)
node scripts/admin.mjs dismiss <slug>     # clear its reports once handled
```

Reports are deleted with their link and purged after `RETENTION_DAYS`.

**Notification.** The worker cannot send e-mail on the free plan. Instead, the daily
_Abuse reports_ workflow fails when reports are waiting, and GitHub e-mails you about the
failed run. Its logs show counts only, never report contents. Enable it once:

```bash
gh secret set ADMIN_TOKEN   # the same value as the worker's ADMIN_TOKEN secret
```

It reads the worker URL from the `VITE_API_URL` repository variable (§6). Without the
secret, the job succeeds with a notice and checks nothing.

## 12. Monitoring and alerts

The _Monitor_ workflow (`.github/workflows/monitor.yml`) runs every hour. When something is
wrong the run fails, and GitHub e-mails you about it (as for abuse reports). It checks:

- the worker answers (`/api/health`);
- the database answers: an unknown QR code must get the 404 page. A 503 means D1 is
  failing, usually because a daily quota is exhausted;
- the web app is served and points to the worker;
- **the free plan's daily quotas** (account-wide, reset at 00:00 UTC): the run fails once
  Worker requests, D1 rows read or D1 rows written pass **70 %** of their limit, while there
  is still time to react (§10: custom domain + WAF rule, or Workers Paid). Today's figures
  are shown in each run's summary.

The quota check reads the Cloudflare GraphQL Analytics API with the `CLOUDFLARE_API_TOKEN`
secret, which needs **Account → Account Analytics → Read** (§4). Without it, the step
only prints a warning ("Cloudflare usage is not readable") and the uptime checks still
run. To add it: Dashboard → My profile → API Tokens → the token → _Edit_ → add the
permission → _Continue to summary_ → _Update token_. The secret keeps the same value.

Run it by hand with `gh workflow run monitor.yml`. While the repository is private, each
hourly run costs about one minute of the 2,000 free Actions minutes per month (about 720 a
month); public repositories do not pay for Actions minutes. GitHub's scheduler can start
runs late, and it pauses scheduled workflows after 60 days without commits: re-enable it
from the Actions tab if that happens. For alerts within minutes, add an external uptime
service (e.g. UptimeRobot's free plan) watching
`https://qr-tracker.<your-subdomain>.workers.dev/r/zzzzzzz` for a 404.

## 13. Backups and restore

**D1 Time Travel** keeps the database's history without any setup: the last **7 days** on
the free plan (30 days on Workers Paid), restorable to any minute.

```bash
cd apps/worker
# Where would a restore go? (prints the bookmark for that moment)
pnpm exec wrangler d1 time-travel info qr-tracker-db --timestamp=2026-11-01T12:00:00Z
# Restore the whole database to that moment
pnpm exec wrangler d1 time-travel restore qr-tracker-db --timestamp=2026-11-01T12:00:00Z
```

A restore **replaces the whole database**: links created and scans recorded after that
moment are lost. It prints a bookmark of the state just before the restore; run
`time-travel restore … --bookmark=<that bookmark>` to undo it. Restoring does not touch
the worker's code: if a release changed the schema since that moment, roll the worker
back too (§9).

**Off-site copy**, e.g. before a risky migration:

```bash
pnpm exec wrangler d1 export qr-tracker-db --remote --output=backup-$(date +%F).sql
```

The file holds the key hashes, every destination and the abuse reports' free text: keep it
private, outside the repository (never commit it). To load it into a new, empty database:
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
