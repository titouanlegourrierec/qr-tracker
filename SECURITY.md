# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for a security problem. Report it privately instead:

- on GitHub: **Security** tab → **Report a vulnerability** (private vulnerability reporting);
- or by e-mail: <titouanlegourrierec@kaist.ac.kr>.

Describe what you found and how to reproduce it. This is a personal project maintained on
a best-effort basis: expect a first answer within about a week. Please give a reasonable
delay before disclosing the problem publicly.

## Scope

In scope:

- the worker at `qr-tracker.titouanlegourrierec.workers.dev` (API, redirects);
- the web app at `titouanlegourrierec.github.io/qr-tracker/`;
- this repository's code and GitHub Actions workflows.

Out of scope:

- a QR code that leads to phishing, malware or other harmful content: use the site's
  **Report abuse** page — such links are blocked for everyone;
- floods that exhaust the Cloudflare free plan's daily quotas: a known, documented
  limitation ([docs/DEPLOYMENT.md §10](docs/DEPLOYMENT.md#10-protecting-the-redirect-from-floods));
- findings that need an already compromised device or browser.

## Supported versions

Only the latest release, deployed from `main`, is maintained.

## Design notes for reviewers

- Secret and read-only keys are 256-bit random values. Only their SHA-256 hashes are
  stored, and they travel only in the `Authorization` header and in the URL fragment,
  which browsers never send ([ADR 0002](docs/adr/0002-secret-key-model.md)).
- No IP address, full user-agent or persistent identifier is stored or logged
  ([ADR 0003](docs/adr/0003-privacy-visitor-hashing.md)).
