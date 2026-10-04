-- People can delete their own account.
-- A staff member's account is emptied of personal details but kept, so the
-- sales and records they made still add up; deleted_at marks it.
ALTER TABLE users ADD COLUMN deleted_at TEXT;

-- An Owner deleting their account erases the whole business. closing_at is set
-- first, in the same transaction, and is the only thing that lets the delete
-- protection below step aside for that business's rows.
ALTER TABLE businesses ADD COLUMN closing_at TEXT;

DROP TRIGGER prevent_sale_delete;
CREATE TRIGGER prevent_sale_delete
BEFORE DELETE ON sales
WHEN NOT EXISTS (SELECT 1 FROM businesses WHERE id = OLD.business_id AND closing_at IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'sales are voided, never deleted');
END;

DROP TRIGGER prevent_shift_delete;
CREATE TRIGGER prevent_shift_delete
BEFORE DELETE ON shifts
WHEN NOT EXISTS (SELECT 1 FROM businesses WHERE id = OLD.business_id AND closing_at IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'shifts cannot be deleted');
END;

DROP TRIGGER prevent_inventory_ledger_delete;
CREATE TRIGGER prevent_inventory_ledger_delete
BEFORE DELETE ON inventory_ledger
WHEN NOT EXISTS (SELECT 1 FROM businesses WHERE id = OLD.business_id AND closing_at IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'inventory ledger entries are immutable');
END;

DROP TRIGGER prevent_audit_log_delete;
CREATE TRIGGER prevent_audit_log_delete
BEFORE DELETE ON audit_logs
WHEN NOT EXISTS (SELECT 1 FROM businesses WHERE id = OLD.business_id AND closing_at IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'audit log entries are immutable');
END;
