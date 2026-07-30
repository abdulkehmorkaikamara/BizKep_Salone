PRAGMA foreign_keys = ON;

CREATE TABLE businesses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL DEFAULT 210000,
  role TEXT NOT NULL CHECK (role IN ('Owner', 'Manager', 'Attendant')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  name TEXT NOT NULL,
  sku TEXT NOT NULL,
  category TEXT NOT NULL,
  reorder_level INTEGER NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  cost_price REAL NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  selling_price REAL NOT NULL DEFAULT 0 CHECK (selling_price >= 0),
  expiry TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (business_id, sku)
);

CREATE TABLE sales (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  subtotal REAL NOT NULL CHECK (subtotal >= 0),
  discount REAL NOT NULL DEFAULT 0 CHECK (discount >= 0),
  total REAL NOT NULL CHECK (total >= 0),
  cash_amount REAL NOT NULL DEFAULT 0 CHECK (cash_amount >= 0),
  orange_amount REAL NOT NULL DEFAULT 0 CHECK (orange_amount >= 0),
  afrimoney_amount REAL NOT NULL DEFAULT 0 CHECK (afrimoney_amount >= 0),
  recorded_by TEXT NOT NULL REFERENCES users(id),
  sale_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'voided'))
);

CREATE TABLE sale_items (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES sales(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price REAL NOT NULL CHECK (unit_price >= 0),
  unit_cost REAL NOT NULL CHECK (unit_cost >= 0)
);

CREATE TABLE inventory_ledger (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('opening_stock', 'sale', 'purchase', 'damage', 'expiry', 'return', 'correction', 'sale_void')),
  quantity_delta INTEGER NOT NULL CHECK (quantity_delta != 0),
  balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
  reference_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  actor_user_id TEXT NOT NULL REFERENCES users(id),
  approved_by_user_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE adjustment_requests (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  quantity_delta INTEGER NOT NULL CHECK (quantity_delta != 0),
  reason_code TEXT NOT NULL CHECK (reason_code IN ('purchase', 'damage', 'expiry', 'return', 'correction')),
  notes TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_by TEXT NOT NULL REFERENCES users(id),
  reviewed_by TEXT REFERENCES users(id),
  requested_at TEXT NOT NULL,
  reviewed_at TEXT
);

CREATE TABLE expenses (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  payment_method TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount > 0),
  expense_date TEXT NOT NULL,
  recorded_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  voided_at TEXT,
  voided_by TEXT REFERENCES users(id)
);

CREATE TABLE debts (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  original_amount REAL NOT NULL CHECK (original_amount > 0),
  balance REAL NOT NULL CHECK (balance >= 0),
  due_date TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE debt_payments (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  debt_id TEXT NOT NULL REFERENCES debts(id),
  amount REAL NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL,
  recorded_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  actor_user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_sessions_token ON sessions(token_hash, expires_at);
CREATE INDEX idx_users_business ON users(business_id, status);
CREATE INDEX idx_products_business ON products(business_id, active);
CREATE INDEX idx_inventory_product ON inventory_ledger(business_id, product_id, created_at);
CREATE INDEX idx_sales_business_date ON sales(business_id, sale_date);
CREATE INDEX idx_adjustments_status ON adjustment_requests(business_id, status, requested_at);
CREATE INDEX idx_expenses_business_date ON expenses(business_id, expense_date);
CREATE INDEX idx_debts_business ON debts(business_id, balance);
CREATE INDEX idx_audit_business_time ON audit_logs(business_id, created_at);

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
WHEN (
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

CREATE TRIGGER prevent_audit_log_update
BEFORE UPDATE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit log entries are immutable');
END;

CREATE TRIGGER prevent_audit_log_delete
BEFORE DELETE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit log entries are immutable');
END;
