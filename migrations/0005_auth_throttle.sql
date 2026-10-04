-- Failed sign-in and recovery attempts are now counted per network address
-- (see src/throttle.js) instead of locking the whole account, which let anyone
-- who knew a username lock its owner out.
CREATE TABLE auth_throttle (
  key TEXT PRIMARY KEY,
  failures INTEGER NOT NULL CHECK (failures > 0),
  window_start TEXT NOT NULL,
  locked_until TEXT
);

CREATE INDEX idx_auth_throttle_window ON auth_throttle(window_start);

-- The per-account lock is no longer used; release any account it still holds.
UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE failed_attempts != 0 OR locked_until IS NOT NULL;
