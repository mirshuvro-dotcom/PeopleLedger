/**
 * Authentication primitives.
 * Requirements: IAM-01 (passwords, TOTP, recovery), NFR-01 (secrets encrypted at rest), NFR-02.
 */
import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  DataKey,
  hashPassword,
  hotp,
  passwordPolicyIssues,
  totpCode,
  verifyPassword,
  verifyTotp,
} from "../src/index.js";

const FAST = { N: 2 ** 12, r: 8, p: 1 };

describe("TOTP (RFC 6238 / RFC 4226)", () => {
  const rfcSecret = Buffer.from("12345678901234567890");

  it("matches the RFC 4226 HOTP test vectors", () => {
    const expected = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];
    expect(expected.map((_, i) => hotp(rfcSecret, i))).toEqual(expected);
  });

  it("matches the RFC 6238 SHA-1 vectors (8 digits)", () => {
    expect(hotp(rfcSecret, Math.floor(59 / 30), 8)).toBe("94287082");
    expect(hotp(rfcSecret, Math.floor(1111111109 / 30), 8)).toBe("07081804");
    expect(hotp(rfcSecret, Math.floor(20000000000 / 30), 8)).toBe("65353130");
  });

  it("round-trips base32", () => {
    expect(base32Encode(rfcSecret)).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(base32Decode("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ").equals(rfcSecret)).toBe(true);
  });

  it("accepts ±1 step of drift and refuses replay of a used step", () => {
    const secret = base32Encode(rfcSecret);
    const at = new Date(1_800_000_000_000);
    const code = totpCode(secret, at);
    const step = verifyTotp(secret, code, new Date(at.getTime() + 30_000), null);
    expect(step).not.toBeNull();
    expect(verifyTotp(secret, code, at, step)).toBeNull();
    expect(verifyTotp(secret, code, new Date(at.getTime() + 120_000), null)).toBeNull();
    expect(verifyTotp(secret, "12345", at, null)).toBeNull();
  });
});

describe("password hashing and policy", () => {
  it("verifies the right password and rejects others; salts differ", async () => {
    const a = await hashPassword("Synthetic correct horse 42", FAST);
    const b = await hashPassword("Synthetic correct horse 42", FAST);
    expect(a).toMatch(/^scrypt\$4096\$8\$1\$/);
    expect(a).not.toBe(b);
    expect(await verifyPassword("Synthetic correct horse 42", a)).toBe(true);
    expect(await verifyPassword("Synthetic correct horse 43", a)).toBe(false);
    expect(await verifyPassword("anything", "not-a-hash")).toBe(false);
  });

  it("uses the OWASP scrypt parameters by default", async () => {
    expect(await hashPassword("Another synthetic passphrase")).toMatch(/^scrypt\$131072\$8\$1\$/);
  });

  it.each([
    ["short1", "Use at least 12 characters."],
    ["password1234", "This password is too common."],
    ["Bangladesh123!", "This password is too common."],
    ["aaaaaaaaaaaaaaaa", "Do not repeat a single character."],
    ["rahim.synthetic-2026", "Do not include your email name in the password."],
  ])("rejects %s", (pw, message) => {
    expect(passwordPolicyIssues(pw, { email: "rahim.synthetic@example.test" })).toContain(message);
  });

  it("accepts a long, uncommon passphrase", () => {
    expect(passwordPolicyIssues("tea garden monsoon lantern 7", { email: "x@example.test" })).toEqual([]);
  });
});

describe("secrets at rest (NFR-01)", () => {
  const key = DataKey.fromBase64(DataKey.generateBase64());

  it("encrypts with a fresh IV and decrypts only with the same context", () => {
    const a = key.encrypt("JBSWY3DPEHPK3PXP", "totp:user-1");
    expect(a).toMatch(/^v1:/);
    expect(a).not.toBe(key.encrypt("JBSWY3DPEHPK3PXP", "totp:user-1"));
    expect(key.decrypt(a, "totp:user-1")).toBe("JBSWY3DPEHPK3PXP");
    expect(() => key.decrypt(a, "totp:user-2")).toThrow();
  });

  it("detects tampering and wrong keys", () => {
    const a = key.encrypt("secret", "ctx");
    const raw = Buffer.from(a.slice(3), "base64");
    raw.writeUInt8(raw.readUInt8(raw.length - 1) ^ 1, raw.length - 1);
    expect(() => key.decrypt(`v1:${raw.toString("base64")}`, "ctx")).toThrow();
    expect(() => DataKey.fromBase64(DataKey.generateBase64()).decrypt(a, "ctx")).toThrow();
    expect(() => DataKey.fromBase64("too-short")).toThrow(/32 random bytes/);
  });
});
