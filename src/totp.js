const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function normalizeOtp(value) {
  const code = String(value || "").replace(/\s+/g, "");
  return /^\d{6}$/.test(code) ? code : "";
}

export function toBase32(bytes) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function fromBase32(input) {
  const normalized = String(input || "").toUpperCase().replace(/=+$/g, "");
  let bits = 0;
  let value = 0;
  const output = [];
  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) throw new Error("Invalid authenticator secret.");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(output);
}

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value) {
  const padded = String(value).replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

async function encryptionKey(pepper) {
  const material = new TextEncoder().encode(`bizkep-totp-v1\u0000${pepper}`);
  const digest = await crypto.subtle.digest("SHA-256", material);
  return crypto.subtle.importKey("raw", digest, {name:"AES-GCM"}, false, ["encrypt", "decrypt"]);
}

export async function encryptTotpSecret(secret, pepper) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await encryptionKey(pepper);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    {name:"AES-GCM", iv},
    key,
    new TextEncoder().encode(secret)
  ));
  return `${base64Url(iv)}.${base64Url(encrypted)}`;
}

export async function decryptTotpSecret(value, pepper) {
  const [ivValue, encryptedValue] = String(value || "").split(".");
  if (!ivValue || !encryptedValue) throw new Error("Authenticator recovery is unavailable.");
  const key = await encryptionKey(pepper);
  const decrypted = await crypto.subtle.decrypt(
    {name:"AES-GCM", iv:fromBase64Url(ivValue)},
    key,
    fromBase64Url(encryptedValue)
  );
  return new TextDecoder().decode(decrypted);
}

export async function generateTotp(secret, timestamp = Date.now(), digits = 6) {
  const key = await crypto.subtle.importKey(
    "raw",
    fromBase32(secret),
    {name:"HMAC", hash:"SHA-1"},
    false,
    ["sign"]
  );
  let counter = Math.floor(timestamp / 1000 / 30);
  const message = new Uint8Array(8);
  for (let index = 7; index >= 0; index -= 1) {
    message[index] = counter & 255;
    counter = Math.floor(counter / 256);
  }
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, message));
  const offset = signature[signature.length - 1] & 15;
  const binary = (
    ((signature[offset] & 127) << 24) |
    (signature[offset + 1] << 16) |
    (signature[offset + 2] << 8) |
    signature[offset + 3]
  ) >>> 0;
  return String(binary % (10 ** digits)).padStart(digits, "0");
}

export async function verifyTotp(secret, code, timestamp = Date.now()) {
  for (const offset of [-1, 0, 1]) {
    const candidate = await generateTotp(secret, timestamp + offset * 30000);
    if (constantTimeEqual(candidate, code)) return true;
  }
  return false;
}

function constantTimeEqual(left, right) {
  const a = new TextEncoder().encode(String(left));
  const b = new TextEncoder().encode(String(right));
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (a[index % a.length] || 0) ^ (b[index % b.length] || 0);
  }
  return difference === 0;
}
