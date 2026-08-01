import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";
import { TokenEncryptionNotConfiguredError } from "@/lib/integrations/errors";

/**
 * Authenticated encryption for OAuth tokens at rest (plan.md S9, S11).
 *
 * AES-256-GCM with a random 96-bit IV per message and the GCM auth tag, so any
 * tampering with stored ciphertext is detected on decrypt. The key comes from
 * TOKEN_ENCRYPTION_KEY (base64 for exactly 32 bytes). Plaintext tokens are never
 * logged; only the opaque `v1.iv.tag.ct` blob is stored in the database.
 *
 * The key is read from `process.env` lazily (not the cached env module) so it is
 * easy to configure per-process and per-test.
 */

const KEY_ENV = "TOKEN_ENCRYPTION_KEY";
const VERSION = "v1";
const IV_BYTES = 12;

function getKey(): Buffer {
  const raw = process.env[KEY_ENV];
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new TokenEncryptionNotConfiguredError();
  }
  let key: Buffer;
  try {
    key = Buffer.from(raw.trim(), "base64");
  } catch {
    throw new TokenEncryptionNotConfiguredError(
      "TOKEN_ENCRYPTION_KEY must be valid base64 encoding 32 bytes.",
    );
  }
  if (key.length !== 32) {
    throw new TokenEncryptionNotConfiguredError(
      `TOKEN_ENCRYPTION_KEY must decode to 32 bytes (got ${key.length}). Generate one with: openssl rand -base64 32`,
    );
  }
  return key;
}

/** True when a valid 32-byte encryption key is configured. */
export function isTokenEncryptionConfigured(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}

/** Encrypt a secret string into an opaque `v1.iv.tag.ciphertext` blob. */
export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}

/** Decrypt a blob produced by {@link encryptSecret}. Throws on tampering. */
export function decryptSecret(blob: string): string {
  const key = getKey();
  const parts = blob.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Malformed encrypted token.");
  }
  const iv = Buffer.from(parts[1]!, "base64");
  const tag = Buffer.from(parts[2]!, "base64");
  const ciphertext = Buffer.from(parts[3]!, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/** Constant-time string comparison helper (for opaque tokens / state values). */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
