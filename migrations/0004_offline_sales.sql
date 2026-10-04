-- Offline sales: a sale recorded on a disconnected device is synced later and
-- must never be lost, so it may take stock below zero. Every other ledger event
-- still cannot reduce stock below zero, and positive entries (restocks) are
-- always allowed so a negative balance can be corrected.
--
-- SQLite cannot drop a CHECK constraint, so the ledger is rebuilt with the same
-- columns (same order) minus `balance_after >= 0`, plus the 'offline_sale' type.

PRAGMA defer_foreign_keys = true;

CREATE TABLE inventory_ledger_new (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('opening_stock', 'sale', 'offline_sale', 'purchase', 'damage', 'expiry', 'return', 'correction', 'sale_void')),
  quantity_delta INTEGER NOT NULL CHECK (quantity_delta != 0),
  balance_after INTEGER NOT NULL,
  reference_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  actor_user_id TEXT NOT NULL REFERENCES users(id),
  approved_by_user_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

INSERT INTO inventory_ledger_new
  (id,business_id,product_id,event_type,quantity_delta,balance_after,reference_type,reference_id,reason,actor_user_id,approved_by_user_id,created_at)
SELECT id,business_id,product_id,event_type,quantity_delta,balance_after,reference_type,reference_id,reason,actor_user_id,approved_by_user_id,created_at
FROM inventory_ledger;

DROP TABLE inventory_ledger;
ALTER TABLE inventory_ledger_new RENAME TO inventory_ledger;

CREATE INDEX idx_inventory_product ON inventory_ledger(business_id, product_id, created_at);

CREATE TRIGGER prevent_inventory_ledger_update
BEFORE UPDATE ON inventory_ledger
BEGIN
  SELECT RAISE(ABORT, 'inventory ledger entries are immutable');
END;

CREATE TRIGGER enforce_inventory_ledger_balance
BEFORE INSERT ON inventory_ledger
WHEN NEW.balance_after != (
  SELECT COALESCE(SUM(quantity_delta), 0) + NEW.quantity_delta
  FROM inventory_ledger
  WHERE business_id = NEW.business_id AND product_id = NEW.product_id
)
BEGIN
  SELECT RAISE(ABORT, 'inventory ledger balance mismatch');
END;

CREATE TRIGGER prevent_negative_inventory
BEFORE INSERT ON inventory_ledger
WHEN NEW.quantity_delta < 0 AND NEW.event_type != 'offline_sale' AND (
  SELECT COALESCE(SUM(quantity_delta), 0) + NEW.quantity_delta
  FROM inventory_ledger
  WHERE business_id = NEW.business_id AND product_id = NEW.product_id
) < 0
BEGIN
  SELECT RAISE(ABORT, 'insufficient inventory');
END;

CREATE TRIGGER prevent_inventory_ledger_delete
BEFORE DELETE ON inventory_ledger
BEGIN
  SELECT RAISE(ABORT, 'inventory ledger entries are immutable');
END;

ALTER TABLE sales ADD COLUMN sold_offline INTEGER NOT NULL DEFAULT 0 CHECK (sold_offline IN (0, 1));
