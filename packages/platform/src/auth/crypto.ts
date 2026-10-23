import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Small cryptographic helpers (NFR-01). Built on node:crypto only.
 */

/** 256-bit random token, URL-safe. Only its sha256 is ever stored. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Field encryption for secrets at rest (AES-256-GCM). Ciphertext format
 * `v1:<base64(iv | tag | ciphertext)>`; the version prefix allows key rotation.
 */
export class DataKey {
  private constructor(private readonly key: Buffer) {}

  static fromBase64(value: string | undefined): DataKey {
    const key = Buffer.from(value ?? "", "base64");
    if (key.length !== 32) throw new Error("PEOPLELEDGER_DATA_KEY must be 32 random bytes, base64 encoded.");
    return new DataKey(key);
  }

  static generateBase64(): string {
    return randomBytes(32).toString("base64");
  }

  encrypt(plaintext: string, context: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(context, "utf8"));
    const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return `v1:${Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64")}`;
  }

  /** `context` (e.g. the owning user id) must match encryption, so ciphertext can't be moved between rows. */
  decrypt(ciphertext: string, context: string): string {
    if (!ciphertext.startsWith("v1:")) throw new Error("Unknown ciphertext version.");
    const raw = Buffer.from(ciphertext.slice(3), "base64");
    const decipher = createDecipheriv("aes-256-gcm", this.key, raw.subarray(0, 12));
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  }
}
