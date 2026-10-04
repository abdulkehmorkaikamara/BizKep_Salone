-- Sale voids: staff request a void with a reason and the Owner approves or
-- rejects it (an Owner's own request is approved at once). An approved void
-- marks the sale voided and returns its stock through 'sale_void' ledger entries.
CREATE TABLE sale_void_requests (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  sale_id TEXT NOT NULL REFERENCES sales(id),
  reason TEXT NOT NULL CHECK (length(reason) >= 5),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_by TEXT NOT NULL REFERENCES users(id),
  reviewed_by TEXT REFERENCES users(id),
  requested_at TEXT NOT NULL,
  reviewed_at TEXT
);

-- At most one open request per sale.
CREATE UNIQUE INDEX idx_sale_void_one_pending ON sale_void_requests(sale_id) WHERE status = 'pending';
CREATE INDEX idx_sale_void_status ON sale_void_requests(business_id, status, requested_at);

-- A recorded sale never changes, except to be voided once. Voiding twice fails,
-- which also stops two simultaneous approvals from returning the stock twice.
CREATE TRIGGER sales_only_change_by_voiding
BEFORE UPDATE ON sales
WHEN NOT (OLD.status = 'completed' AND NEW.status = 'voided'
  AND NEW.id = OLD.id AND NEW.business_id = OLD.business_id
  AND NEW.subtotal = OLD.subtotal AND NEW.discount = OLD.discount AND NEW.total = OLD.total
  AND NEW.cash_amount = OLD.cash_amount AND NEW.orange_amount = OLD.orange_amount AND NEW.afrimoney_amount = OLD.afrimoney_amount
  AND NEW.recorded_by = OLD.recorded_by AND NEW.sale_date = OLD.sale_date AND NEW.created_at = OLD.created_at)
BEGIN
  SELECT RAISE(ABORT, 'sales can only be changed by voiding them once');
END;

CREATE TRIGGER prevent_sale_delete
BEFORE DELETE ON sales
BEGIN
  SELECT RAISE(ABORT, 'sales are voided, never deleted');
END;
