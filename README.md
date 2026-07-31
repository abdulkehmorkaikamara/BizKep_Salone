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

## Run locally

No dependencies or build step are required:

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

Data is stored in the browser on the current device. The settings page can download a JSON backup or restore the included demo dataset.

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
```

Use a randomly generated value of at least 32 characters for `BOOTSTRAP_TOKEN`.
The same value is required once on the first-owner setup screen and is never
stored in the browser or database. Keep the deployed secret in place after
setup: the Worker also uses it as a server-only password pepper. Deleting or
rotating it without migrating password hashes will prevent existing users from
signing in.

The API refuses owner bootstrap while `BOOTSTRAP_TOKEN` is absent, so the first
code deployment can safely happen before the secret is added.

The secure architecture provides individual sessions, server-enforced Owner,
Manager and Attendant permissions, append-only inventory and audit ledgers, and
owner approval for stock adjustments.
