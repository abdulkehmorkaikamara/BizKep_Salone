import assert from "node:assert/strict";
import {
  decryptTotpSecret,
  encryptTotpSecret,
  fromBase32,
  generateTotp,
  normalizeOtp,
  toBase32,
  verifyTotp
} from "../src/totp.js";

const rfcSecret = toBase32(new TextEncoder().encode("12345678901234567890"));
assert.equal(rfcSecret, "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
assert.deepEqual(fromBase32(rfcSecret), new TextEncoder().encode("12345678901234567890"));
assert.equal(await generateTotp(rfcSecret, 59000, 8), "94287082");
assert.equal(await generateTotp(rfcSecret, 59000), "287082");
assert.equal(await verifyTotp(rfcSecret, "287082", 59000), true);
assert.equal(await verifyTotp(rfcSecret, "000000", 59000), false);
assert.equal(normalizeOtp(" 287 082 "), "287082");
assert.equal(normalizeOtp("12345"), "");

const encrypted = await encryptTotpSecret(rfcSecret, "test-pepper");
assert.notEqual(encrypted, rfcSecret);
assert.equal(await decryptTotpSecret(encrypted, "test-pepper"), rfcSecret);
await assert.rejects(() => decryptTotpSecret(encrypted, "wrong-pepper"));

console.log("TOTP tests passed");
