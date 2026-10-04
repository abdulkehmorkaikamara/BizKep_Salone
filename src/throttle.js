// Limits failed sign-in and password-recovery attempts by where they come from,
// so a stranger guessing wrong cannot lock the real user out of their account.
//
// Each attempt is counted under several keys. A key that reaches its limit within
// the window is blocked until the lock expires; any blocked key refuses the attempt.
//   ip+user  one network address trying one username (the usual case)
//   ip       one network address trying many usernames (password spraying)
//   user     every address trying one username; only used for recovery, where it
//            caps guesses at the six-digit code and pauses recovery, never sign-in

export const WINDOW_MINUTES = 15;
const WINDOW_MS = WINDOW_MINUTES * 60000;

const LIMITS = {
  login: { "ip+user": 5, ip: 20 },
  recovery: { "ip+user": 5, ip: 20, user: 10 }
};

async function hashKey(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

// Keys are hashed so the table never stores raw IP addresses or usernames.
export async function throttleKeys(kind, ip, username) {
  const limits = LIMITS[kind];
  if (!limits) throw new Error(`Unknown throttle kind: ${kind}`);
  const parts = { "ip+user": `${ip}|${username}`, ip, user: username };
  return Promise.all(Object.entries(limits).map(async ([scope, max]) => ({
    scope, max, key: `${kind}:${scope}:${await hashKey(parts[scope])}`
  })));
}

export async function isThrottled(db, keys, now = Date.now()) {
  const placeholders = keys.map((_, index) => `?${index + 1}`).join(",");
  const rows = (await db.prepare(`SELECT locked_until FROM auth_throttle WHERE key IN (${placeholders})`)
    .bind(...keys.map(item => item.key)).all()).results;
  return rows.some(row => row.locked_until && Date.parse(row.locked_until) > now);
}

// Counts one failure against every key. Returns true if the attempt is now blocked.
export async function recordFailure(db, keys, now = Date.now()) {
  const nowIso = new Date(now).toISOString();
  const windowStart = new Date(now - WINDOW_MS).toISOString();
  const lockUntil = new Date(now + WINDOW_MS).toISOString();
  const statements = keys.map(({ key, max }) => db.prepare(`
    INSERT INTO auth_throttle (key, failures, window_start, locked_until)
    VALUES (?1, 1, ?2, CASE WHEN ?4 <= 1 THEN ?5 END)
    ON CONFLICT(key) DO UPDATE SET
      failures = CASE WHEN window_start < ?3 THEN 1 ELSE failures + 1 END,
      window_start = CASE WHEN window_start < ?3 THEN ?2 ELSE window_start END,
      locked_until = CASE WHEN (CASE WHEN window_start < ?3 THEN 1 ELSE failures + 1 END) >= ?4 THEN ?5 ELSE locked_until END
  `).bind(key, nowIso, windowStart, max, lockUntil));
  // Forget keys that have been quiet for a day so the table stays small.
  statements.push(db.prepare("DELETE FROM auth_throttle WHERE window_start < ?1 AND (locked_until IS NULL OR locked_until < ?2)")
    .bind(new Date(now - 86400000).toISOString(), nowIso));
  await db.batch(statements);
  return isThrottled(db, keys, now);
}

// After a success, clears the counts that belong to this user.
export async function clearFailures(db, keys) {
  const own = keys.filter(item => item.scope !== "ip");
  if (!own.length) return;
  const placeholders = own.map((_, index) => `?${index + 1}`).join(",");
  await db.prepare(`DELETE FROM auth_throttle WHERE key IN (${placeholders})`).bind(...own.map(item => item.key)).run();
}
