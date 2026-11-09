# Documentation

| Document                                   | For                                                                               |
| ------------------------------------------ | --------------------------------------------------------------------------------- |
| [User guide](user-guide.md)                | People making QR codes: create, read the statistics, share, edit, report          |
| [Architecture](ARCHITECTURE.md)            | How it works: flows, API, data model, worker layering, known limitations          |
| [Development](development.md)              | Running it locally: setup, commands, code layout, tests, tech stack               |
| [Deployment and operations](DEPLOYMENT.md) | Deploying from scratch, releases and rollback, floods, abuse, monitoring, backups |
| [Decision records](adr/)                   | Why Cloudflare Workers + D1, per-link keys, the privacy model, abuse handling     |
| [Original plan](PLAN.md)                   | The design approved before implementation (historical, not maintained)            |

Also at the repository root: [CONTRIBUTING.md](../CONTRIBUTING.md) (rules for a change),
[SECURITY.md](../SECURITY.md) (reporting a vulnerability) and
[CHANGELOG.md](../CHANGELOG.md).

## Decision records

1. [Cloudflare Workers + D1 for the backend](adr/0001-cloudflare-workers-d1.md)
2. [Per-link secret keys instead of accounts](adr/0002-secret-key-model.md)
3. [Privacy model and daily-salted visitor hashing](adr/0003-privacy-visitor-hashing.md)
4. [Abuse handling: Safe Browsing check and anonymous reports](adr/0004-abuse-handling.md)
