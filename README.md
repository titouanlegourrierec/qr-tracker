# QR Tracker

Free QR code generator with anonymous scan analytics. No accounts — each QR code has its
own secret key. Static SPA on GitHub Pages + Cloudflare Worker (Hono + D1), free tiers only.

> 🚧 Under construction — see [docs/PLAN.md](docs/PLAN.md) for the full design and
> milestone plan. This README will be completed in the final milestone.

## Quickstart (development)

```bash
# Node 24 (.nvmrc) — Corepack ships with Node 24: corepack enable
# otherwise: npm i -g pnpm
pnpm install
pnpm dev
```

## Scripts

`pnpm check` (format check + lint + typecheck + tests) · `pnpm test:e2e` · `pnpm build`
