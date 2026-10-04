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
  negative stock. The one exception is a sale recorded while offline (see
  below), which may take stock below zero; positive entries such as restocks
  are always allowed so a negative balance can be corrected.

## Audit controls

Privileged actions append a record containing the actor, action, entity,
timestamp, request IP, user agent, and relevant before/after state. Database
triggers reject audit-record updates and deletion.

Expense records are voided rather than deleted. Staff accounts are disabled
rather than removed, and disabling an account invalidates all its sessions.

## Authentication controls

- PBKDF2-SHA-256 password derivation with per-user random salts and a
  server-only pepper. The pepper prevents an isolated D1 export from being
  sufficient for offline password guessing.
- Cryptographically random 256-bit session tokens.
- Failed sign-ins are limited by network address rather than by account, so
  someone who knows a username cannot lock its owner out. Five failures for
  one username from one address, or twenty across any usernames, block that
  address for 15 minutes. Counts are stored as SHA-256 hashes, never as raw
  addresses or usernames.
- Cloudflare Turnstile is validated server-side on public signup, sign-in, and
  first-owner setup, and password-reset requests. The Worker verifies token
  success, action, and hostname.
- Owner password recovery uses standards-based TOTP codes from an authenticator
  app. Enrollment requires the current password and confirmation of a live code.
- TOTP secrets are encrypted at rest with AES-GCM using a key derived from the
  server-only password pepper. Recovery accepts codes from the adjacent time
  window to tolerate small clock differences.
- Recovery codes use the same address limits, plus a cap of ten bad codes per
  account every 15 minutes from all addresses combined, which bounds guessing
  of the six-digit code. Reaching that cap pauses recovery only; sign-in keeps
  working. A successful reset revokes every active session for that user.
- Owner bootstrap requires a separate Cloudflare secret. The user enters it
  only during first-owner setup, but the Worker retains it as the password
  pepper and it must not be deleted or rotated without a password migration.
- State-changing requests require a same-origin request.
- API responses are never cached by the service worker.
- Every public signup creates a distinct business ID. Business data queries and
  mutations are scoped to the authenticated user's business ID.

## Offline sales

Sales can be recorded without internet; every other change needs a connection.

- While signed in, the device keeps a copy of the business data that user can
  already see (products, sales, expenses and debts). Staff accounts, approvals
  and the audit trail are not stored. Signing out deletes the copy, and signing
  out is refused while offline so the server session is always ended too.
- Offline sales wait in a queue on the device, tied to the user who recorded
  them, and are only synced while that user is signed in. Each sale carries a
  device-generated ID, so a retried sync is recorded once.
- On sync the server re-checks permissions, products, prices, discounts and
  payments. It skips the stock check, keeps the original sale time (up to 14
  days old), marks the sale as sold offline, and records `offline` and `soldAt`
  in the audit log. A rejected sale stays on the device, flagged, until it is
  retried or discarded.
- Because the server cannot prove a device was offline, a signed-in user could
  use the offline flag to oversell or backdate a sale by up to 14 days. Such
  sales are always marked as offline in the database and audit log.

## Current limitations

- Only sales can be recorded offline. Sales waiting on a shared device sync
  only when the user who recorded them signs in again.
- TOTP currently protects Owner password recovery; it is not yet required on
  every sign-in.
- D1 backups, monitoring alerts, retention policy, and incident response
  procedures must be configured operationally.
- A physical stock count and shift/cash reconciliation process remain necessary
  because software cannot detect goods sold completely outside the system.

Security issues should not be posted publicly. Contact the repository owner
privately with reproduction steps and impact.
