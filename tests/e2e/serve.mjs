// Starts a throwaway local BizKep server for the browser tests.
// Builds a fresh D1 database, seeds one business with an Owner, a Manager and an
// Attendant, gives each a ready-made session (so tests skip the Turnstile login),
// then runs `wrangler dev` against it.
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PORT, SESSIONS } from "./fixtures.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const persist = path.join(root, ".wrangler", "e2e-state");
const wrangler = path.join(root, "node_modules", ".bin", "wrangler");
// Telemetry uploads can hang each wrangler call for minutes on a slow network.
process.env.WRANGLER_SEND_METRICS = "false";
rmSync(persist, { recursive: true, force: true });
mkdirSync(persist, { recursive: true });

const run = args => execFileSync(wrangler, args, { cwd: root, stdio: "inherit" });
run(["d1", "migrations", "apply", "DB", "--local", "--persist-to", persist]);

const hash = token => createHash("sha256").update(token).digest("base64url");
const now = new Date().toISOString();
const expires = new Date(Date.now() + 24 * 3600000).toISOString();
const inYear = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
const lastWeek = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

const users = [
  ["u-owner", "Ama Owner", "owner", "Owner"],
  ["u-manager", "Musa Manager", "manager", "Manager"],
  ["u-attendant", "Isata Attendant", "attendant", "Attendant"]
];
const sql = [
  `INSERT INTO businesses (id,name,type,phone,address,created_at) VALUES ('b1','Test Pharmacy','Pharmacy / Medicine shop','+232 76 111 222','Freetown','${now}');`,
  ...users.map(([id, name, username, role]) =>
    `INSERT INTO users (id,business_id,name,username,password_hash,password_salt,role,created_at) VALUES ('${id}','b1','${name}','${username}','unused','unused','${role}','${now}');`),
  ...Object.entries(SESSIONS).map(([key, { userId, token }]) =>
    `INSERT INTO sessions (id,user_id,token_hash,expires_at,created_at) VALUES ('s-${key}','${userId}','${hash(token)}','${expires}','${now}');`),
  `INSERT INTO products (id,business_id,name,sku,category,reorder_level,cost_price,selling_price,expiry,created_at,updated_at) VALUES ('p1','b1','Paracetamol','MED-001','Pain relief',5,10,20,'${inYear}','${now}','${now}');`,
  `INSERT INTO inventory_ledger VALUES ('l1','b1','p1','opening_stock',100,100,'product','p1','Opening stock','u-owner','u-owner','${now}');`,
  // Offline tests: p2 has a single item left so an offline sale can take it below zero;
  // p3's price is changed mid-test so an offline sale of it is rejected on sync.
  `INSERT INTO products (id,business_id,name,sku,category,reorder_level,cost_price,selling_price,expiry,created_at,updated_at) VALUES ('p2','b1','Vitamin C','MED-002','Supplements',2,5,10,'${inYear}','${now}','${now}');`,
  `INSERT INTO inventory_ledger VALUES ('l2','b1','p2','opening_stock',1,1,'product','p2','Opening stock','u-owner','u-owner','${now}');`,
  `INSERT INTO products (id,business_id,name,sku,category,reorder_level,cost_price,selling_price,expiry,created_at,updated_at) VALUES ('p3','b1','Bandage','MED-003','First aid',5,2,4,'${inYear}','${now}','${now}');`,
  `INSERT INTO inventory_ledger VALUES ('l3','b1','p3','opening_stock',50,50,'product','p3','Opening stock','u-owner','u-owner','${now}');`,
  `INSERT INTO debts (id,business_id,customer_name,customer_phone,original_amount,balance,due_date,notes,created_by,created_at,updated_at) VALUES ('d1','b1','Fatmata Seed','+232 77 000 001',500,500,'${lastWeek}','','u-owner','${now}','${now}');`
];
const seedFile = path.join(tmpdir(), `bizkep-e2e-seed-${process.pid}.sql`);
writeFileSync(seedFile, sql.join("\n"));
run(["d1", "execute", "DB", "--local", "--persist-to", persist, "--file", seedFile, "--yes"]);
rmSync(seedFile, { force: true });

const server = spawn(wrangler, [
  "dev", "--port", String(PORT), "--ip", "127.0.0.1", "--persist-to", persist,
  "--var", "BOOTSTRAP_TOKEN:e2e-bootstrap-token-that-is-at-least-32-chars",
  "--var", "TURNSTILE_SECRET:unused-in-e2e",
  "--var", "TURNSTILE_HOSTNAMES:localhost",
  "--show-interactive-dev-session=false"
], { cwd: root, stdio: "inherit" });
const stop = () => server.kill("SIGTERM");
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
server.on("exit", code => process.exit(code ?? 0));
