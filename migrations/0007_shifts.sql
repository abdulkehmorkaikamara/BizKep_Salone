-- Shift cash-ups: each person opens a shift with the cash already in the drawer
-- and closes it by counting what they hold. The server works out the expected
-- amounts from that person's sales, debt payments and cash expenses during the
-- shift, and stores both so differences can be reviewed later.
CREATE TABLE shifts (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opened_at TEXT NOT NULL,
  opening_float REAL NOT NULL CHECK (opening_float >= 0),
  closed_at TEXT,
  -- Expected cash can be negative if cash expenses exceed the float and takings.
  expected_cash REAL,
  expected_orange REAL,
  expected_afrimoney REAL,
  counted_cash REAL CHECK (counted_cash >= 0),
  counted_orange REAL CHECK (counted_orange >= 0),
  counted_afrimoney REAL CHECK (counted_afrimoney >= 0),
  notes TEXT NOT NULL DEFAULT ''
);

CREATE UNIQUE INDEX idx_shifts_one_open ON shifts(user_id) WHERE status = 'open';
CREATE INDEX idx_shifts_business ON shifts(business_id, opened_at);

-- A closed cash-up is a record of what was counted; it cannot be changed.
CREATE TRIGGER shifts_closed_are_final
BEFORE UPDATE ON shifts
WHEN OLD.status = 'closed'
BEGIN
  SELECT RAISE(ABORT, 'closed shifts cannot be changed');
END;

CREATE TRIGGER prevent_shift_delete
BEFORE DELETE ON shifts
BEGIN
  SELECT RAISE(ABORT, 'shifts cannot be deleted');
END;
