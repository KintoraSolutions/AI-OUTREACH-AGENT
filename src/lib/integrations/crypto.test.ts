import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TokenEncryptionNotConfiguredError } from "@/lib/integrations/errors";

const KEY = Buffer.alloc(32, 7).toString("base64");

async function freshCrypto() {
  // The module reads process.env lazily, so a plain import is fine.
  return import("@/lib/integrations/crypto");
}

describe("token encryption", () => {
  const original = process.env.TOKEN_ENCRYPTION_KEY;
  beforeEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = KEY;
  });
  afterEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = original;
  });

  it("round-trips a secret and produces opaque, non-plaintext ciphertext", async () => {
    const { encryptSecret, decryptSecret } = await freshCrypto();
    const secret = "ya29.super-secret-refresh-token";
    const blob = encryptSecret(secret);
    expect(blob).not.toContain(secret);
    expect(blob.startsWith("v1.")).toBe(true);
    expect(decryptSecret(blob)).toBe(secret);
  });

  it("produces a different ciphertext each time (random IV)", async () => {
    const { encryptSecret } = await freshCrypto();
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("detects tampering via the GCM auth tag", async () => {
    const { encryptSecret, decryptSecret } = await freshCrypto();
    const blob = encryptSecret("secret");
    const parts = blob.split(".");
    // Flip a byte in the ciphertext segment.
    const ct = Buffer.from(parts[3]!, "base64");
    ct[0] = ct[0]! ^ 0xff;
    parts[3] = ct.toString("base64");
    expect(() => decryptSecret(parts.join("."))).toThrow();
  });

  it("reports configured when a valid key is present", async () => {
    const { isTokenEncryptionConfigured } = await freshCrypto();
    expect(isTokenEncryptionConfigured()).toBe(true);
  });

  it("throws a clear config error when the key is missing", async () => {
    delete process.env.TOKEN_ENCRYPTION_KEY;
    const { encryptSecret, isTokenEncryptionConfigured } = await freshCrypto();
    expect(isTokenEncryptionConfigured()).toBe(false);
    expect(() => encryptSecret("x")).toThrow(TokenEncryptionNotConfiguredError);
  });

  it("rejects a key that is not 32 bytes", async () => {
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(16, 1).toString("base64");
    const { encryptSecret } = await freshCrypto();
    expect(() => encryptSecret("x")).toThrow(TokenEncryptionNotConfiguredError);
  });

  it("constant-time equality helper works", async () => {
    const { safeEqual } = await freshCrypto();
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
