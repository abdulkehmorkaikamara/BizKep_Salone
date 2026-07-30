# BizKep security model

## Trust boundaries

The browser is not authoritative. Authentication, permissions, prices, stock
balances, payments, and approval decisions are validated by the Cloudflare
Worker and stored in D1.

The browser never receives password hashes, salts, session tokens, or audit
record payloads. Session tokens use `HttpOnly`, `Secure`, `SameSite=Strict`
cookies and are stored as SHA-256 hashes in D1.

## Roles

- **Owner:** business settings, staff accounts, product pricing, reports,
  adjustment approval, expense voiding, and audit review.
- **Manager:** sales, product metadata, expenses, debts, and adjustment
  requests. Managers cannot change product costs or prices.
- **Attendant:** sales, inventory viewing, and adjustment requests. Costs,
  expenses, debts, reports, staff settings, and approvals are restricted.

Permissions are enforced on every API action. Frontend visibility is only a
usability feature and is not treated as a security control.

## Inventory invariants

Products do not contain an editable stock field. Current stock is the sum of an
append-only `inventory_ledger`.

- Sales append negative ledger entries.
- Opening stock appends an opening entry.
- Purchases, damage, expiry, returns, and corrections require an adjustment
  request.
- Only an Owner can approve an adjustment.
- Database triggers reject ledger edits, deletion, balance mismatches, and
  negative stock.

## Audit controls

Privileged actions append a record containing the actor, action, entity,
timestamp, request IP, user agent, and relevant before/after state. Database
triggers reject audit-record updates and deletion.

Expense records are voided rather than deleted. Staff accounts are disabled
rather than removed, and disabling an account invalidates all its sessions.

## Authentication controls

- PBKDF2-SHA-256 password derivation with per-user random salts.
- Cryptographically random 256-bit session tokens.
- Five failed logins trigger a 15-minute account lock.
- Owner bootstrap requires a separate one-time Cloudflare secret.
- State-changing requests require a same-origin request.
- API responses are never cached by the service worker.

## Current limitations

- Secure offline transaction queues are not implemented. The application is
  read-only while disconnected.
- Password reset and multi-factor authentication are not yet implemented.
- D1 backups, monitoring alerts, retention policy, and incident response
  procedures must be configured operationally.
- A physical stock count and shift/cash reconciliation process remain necessary
  because software cannot detect goods sold completely outside the system.

Security issues should not be posted publicly. Contact the repository owner
privately with reproduction steps and impact.
