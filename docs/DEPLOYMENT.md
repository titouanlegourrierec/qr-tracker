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
3. Account Resources: include → your account. Keep everything else at defaults.
4. Create and copy the token (shown once).

## 5. Set the worker secrets

```bash
cd apps/worker
pnpm exec wrangler secret put TURNSTILE_SECRET_KEY   # paste the Turnstile SECRET key
pnpm exec wrangler secret put ADMIN_TOKEN            # paste a long random string, e.g.:
# generate one:  openssl rand -base64 32
```

Keep the `ADMIN_TOKEN` value somewhere safe — it drives the abuse kill switch
(`node scripts/admin.mjs disable <slug>`).

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

## Troubleshooting

| Symptom                                            | Fix                                                                                                 |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Deploy job fails on migrations                     | Check `database_id` in wrangler.jsonc and the API token's D1 permission                             |
| Web app shows "Impossible de contacter le serveur" | `VITE_API_URL` variable wrong/missing, or the Pages origin is missing from `ALLOWED_ORIGINS`        |
| Turnstile widget shows an error                    | Site key/domain mismatch: the widget's domain list must include `titouanlegourrierec.github.io`     |
| Creation always returns TURNSTILE_FAILED           | `TURNSTILE_SECRET_KEY` secret not set on the worker, or site/secret keys are from different widgets |
| 403 on admin CLI                                   | `ADMIN_TOKEN` secret differs from the one you pass to the script                                    |
