import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { clearFailures, isThrottled, recordFailure, throttleKeys } from "../src/throttle.js";

// A minimal stand-in for the Cloudflare D1 API on top of Node's SQLite.
function d1() {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of readdirSync("migrations").sort()) sqlite.exec(readFileSync(`migrations/${file}`, "utf8"));
  const prepare = sql => ({
    bind: (...args) => ({
      all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
      first: async () => sqlite.prepare(sql).get(...args) ?? null,
      run: async () => sqlite.prepare(sql).run(...args),
      execute: () => sqlite.prepare(sql).run(...args)
    })
  });
  return {
    prepare,
    batch: async statements => {
      sqlite.exec("BEGIN");
      try { statements.forEach(statement => statement.execute()); sqlite.exec("COMMIT"); }
      catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    }
  };
}

const MINUTE = 60000;
const start = Date.parse("2026-10-04T10:00:00Z");
const fail = async (db, keys, times, at = start) => {
  let blocked = false;
  for (let i = 0; i < times; i++) blocked = await recordFailure(db, keys, at);
  return blocked;
};

// A stranger guessing the owner's password blocks only their own network.
{
  const db = d1();
  const stranger = await throttleKeys("login", "203.0.113.9", "owner");
  const owner = await throttleKeys("login", "198.51.100.4", "owner");
  assert.equal(await fail(db, stranger, 4), false);
  assert.equal(await fail(db, stranger, 1), true, "5th failure blocks that network");
  assert.equal(await isThrottled(db, stranger, start + MINUTE), true);
  assert.equal(await isThrottled(db, owner, start + MINUTE), false, "owner on another network is unaffected");
  assert.equal(await isThrottled(db, stranger, start + 16 * MINUTE), false, "block expires after 15 minutes");
}

// One network trying many usernames is blocked after 20 failures in total.
{
  const db = d1();
  for (let i = 0; i < 19; i++) await fail(db, await throttleKeys("login", "203.0.113.9", `user${i}`), 1);
  const next = await throttleKeys("login", "203.0.113.9", "user19");
  assert.equal(await isThrottled(db, next), false);
  assert.equal(await fail(db, next, 1), true);
  assert.equal(await isThrottled(db, await throttleKeys("login", "203.0.113.9", "someone-else")), true);
}

// Failures spread out beyond the 15-minute window start a fresh count.
{
  const db = d1();
  const keys = await throttleKeys("login", "203.0.113.9", "owner");
  await fail(db, keys, 4, start);
  assert.equal(await fail(db, keys, 4, start + 16 * MINUTE), false);
}

// A successful sign-in clears that user's count but not the network's total.
{
  const db = d1();
  const keys = await throttleKeys("login", "203.0.113.9", "owner");
  await fail(db, keys, 4);
  await clearFailures(db, keys);
  assert.equal(await fail(db, keys, 4), false, "count restarted after success");
  const rows = (await db.prepare("SELECT key, failures FROM auth_throttle").bind().all()).results;
  assert.equal(rows.find(row => row.key.startsWith("login:ip:")).failures, 8);
}

// Recovery codes are capped per account across networks, without touching sign-in.
{
  const db = d1();
  for (let i = 0; i < 10; i++) await fail(db, await throttleKeys("recovery", `203.0.113.${i}`, "owner"), 1);
  assert.equal(await isThrottled(db, await throttleKeys("recovery", "198.51.100.4", "owner")), true);
  assert.equal(await isThrottled(db, await throttleKeys("login", "198.51.100.4", "owner")), false);
}

// Raw addresses and usernames are never stored.
{
  const db = d1();
  await fail(db, await throttleKeys("login", "203.0.113.9", "owner"), 1);
  const keys = (await db.prepare("SELECT key FROM auth_throttle").bind().all()).results.map(row => row.key).join(" ");
  assert.ok(!keys.includes("203.0.113.9") && !keys.includes("owner"));
}

// Quiet entries older than a day are cleaned up on the next failure.
{
  const db = d1();
  await fail(db, await throttleKeys("login", "203.0.113.9", "owner"), 1, start);
  await fail(db, await throttleKeys("login", "198.51.100.4", "other"), 1, start + 2 * 86400000);
  const count = (await db.prepare("SELECT COUNT(*) AS n FROM auth_throttle").bind().first()).n;
  assert.equal(count, 2, "only the new address's two keys remain");
}

console.log("Throttle tests passed");
