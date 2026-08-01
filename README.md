# BizKep

An offline-first business management MVP for small shops and pharmacies in Sierra Leone.

## Included

- Daily dashboard with sales, expenses, estimated profit, debts, alerts, and payment reconciliation
- Point of sale with discounts and cash, Orange Money, Afrimoney, or split payments
- Inventory with stock deductions, reorder levels, costs, prices, and expiry alerts
- Expense tracking by category and payment method
- Customer debt balances, due dates, partial payments, and contact shortcuts
- 7/30/90-day reports, best-selling products, and CSV export
- Local data backup and offline PWA caching
- Responsive phone, tablet, and desktop layouts
- Public owner signup with an isolated workspace for each business
- Cloudflare Turnstile bot protection on signup, sign-in, and first-owner setup
- Free Owner password recovery with authenticator-app OTP codes

## Run locally

Copy `.dev.vars.example` to `.dev.vars`, replace both secret placeholders, then
initialize a local D1 database and run the Worker:

```bash
cp .dev.vars.example .dev.vars
npx wrangler d1 migrations apply DB --local
npx wrangler dev
```

Open the localhost address printed by Wrangler. `.dev.vars` is ignored by Git
and must never be committed.

## Deploy on Cloudflare Workers

The repository includes a `wrangler.jsonc` configuration for static asset hosting.

For Cloudflare Workers Builds, use:

- Build command: `exit 0`
- Deploy command: `npx wrangler deploy`
- Production branch: `main`

Every successful push to `main` will publish the latest version automatically.

## Secure database setup

The secure version uses a Cloudflare D1 binding named `DB`. Wrangler can provision
the database automatically on the first deployment. Apply the versioned schema
after provisioning:

```bash
npx wrangler deploy
npx wrangler d1 migrations apply DB --remote
npx wrangler secret put BOOTSTRAP_TOKEN
npx wrangler secret put TURNSTILE_SECRET
```

## Authenticator OTP password recovery

Apply the recovery migration before deploying the feature:

```bash
npx wrangler d1 migrations apply DB --remote
npx wrangler deploy
```

Existing Owners open **Settings → Owner authenticator recovery**, enter their
current password, add the displayed setup key to Google Authenticator,
Microsoft Authenticator, Authy, or another TOTP app, then confirm a six-digit
code. Forgot password accepts the Owner username, a current authenticator code,
and a new password. A successful reset revokes every active session.

Authenticator secrets are encrypted in D1 with AES-GCM using a key derived from
the server-only `BOOTSTRAP_TOKEN`. The secret is shown only during enrollment.

Use a randomly generated value of at least 32 characters for `BOOTSTRAP_TOKEN`.
The same value is required once on the first-owner setup screen and is never
stored in the browser or database. Keep the deployed secret in place after
setup: the Worker also uses it as a server-only password pepper. Deleting or
rotating it without migrating password hashes will prevent existing users from
signing in.

The API refuses owner bootstrap while `BOOTSTRAP_TOKEN` is absent, so the first
code deployment can safely happen before the secret is added.

`TURNSTILE_SECRET` must be the secret for the widget whose public site key is
configured as `TURNSTILE_SITE_KEY` in `wrangler.jsonc`. Never put the secret
itself in the repository. The production hostname allowlist is configured
separately as `TURNSTILE_HOSTNAMES`.

The secure architecture provides individual sessions, server-enforced Owner,
Manager and Attendant permissions, append-only inventory and audit ledgers, and
owner approval for stock adjustments. Each signup creates a new business tenant;
all stock, sales, staff, and reports remain scoped to that tenant.
