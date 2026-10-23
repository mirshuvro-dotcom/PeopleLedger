import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * Password hashing and policy (IAM-01, NFR-02).
 *
 * scrypt with the OWASP Password Storage Cheat Sheet minimum (N=2^17, r=8, p=1).
 * Parameters are stored in the hash, so they can be raised later and old hashes
 * still verify. Policy follows NIST SP 800-63B: length over composition rules,
 * and refusal of known-common and account-derived passwords.
 */
export interface ScryptParams {
  readonly N: number;
  readonly r: number;
  readonly p: number;
}

export const OWASP_SCRYPT: ScryptParams = { N: 2 ** 17, r: 8, p: 1 };

function scrypt(password: string, salt: Buffer, params: ScryptParams): Promise<Buffer> {
  const options: ScryptOptions = { N: params.N, r: params.r, p: params.p, maxmem: 256 * params.N * params.r };
  return new Promise((resolve, reject) => scryptCb(password.normalize("NFKC"), salt, 32, options, (err, key) => (err ? reject(err) : resolve(key))));
}

export async function hashPassword(password: string, params: ScryptParams = OWASP_SCRYPT): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, params);
  return `scrypt$${params.N}$${params.r}$${params.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, salt, expected] = parts;
  const params = { N: Number(n), r: Number(r), p: Number(p) };
  if (![params.N, params.r, params.p].every((x) => Number.isInteger(x) && x > 0)) return false;
  const key = await scrypt(password, Buffer.from(salt!, "base64"), params);
  const want = Buffer.from(expected!, "base64");
  return key.length === want.length && timingSafeEqual(key, want);
}

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * Small offline list of the most common passwords and patterns. A breach
 * corpus check (k-anonymity range API) is a later adapter; this list keeps the
 * obvious ones out without any network call.
 */
const COMMON = new Set([
  "password", "password1", "password12", "password123", "password1234", "passw0rd", "p@ssw0rd", "p@ssword", "letmein", "letmein123",
  "welcome", "welcome1", "welcome123", "admin", "admin123", "administrator", "qwerty", "qwerty123", "qwertyuiop", "asdfghjkl",
  "iloveyou", "monkey", "dragon", "football", "baseball", "sunshine", "princess", "trustno1", "abc123", "abcdef123456",
  "123456", "1234567", "12345678", "123456789", "1234567890", "12345678910", "123123123", "111111111111", "000000000000", "123456789012",
  "changeme", "changeme123", "secret", "secret123", "default", "master", "superman", "batman", "bangladesh", "bangladesh123",
  "dhaka", "dhaka123", "dhaka2025", "dhaka2026", "chittagong", "peopleledger", "payroll", "payroll123", "company123", "summer2025", "winter2025",
]);

export function passwordPolicyIssues(password: string, context: { email?: string } = {}): string[] {
  const issues: string[] = [];
  const length = [...password].length;
  if (length < PASSWORD_MIN_LENGTH) issues.push(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
  if (length > PASSWORD_MAX_LENGTH) issues.push(`Use at most ${PASSWORD_MAX_LENGTH} characters.`);
  const lower = password.toLowerCase();
  const stripped = lower.replace(/[^a-z0-9@]/g, "");
  if (COMMON.has(lower) || COMMON.has(stripped) || COMMON.has(stripped.replace(/\d+$/, ""))) issues.push("This password is too common.");
  if (/^(.)\1+$/.test(password)) issues.push("Do not repeat a single character.");
  const local = context.email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 3 && lower.includes(local)) issues.push("Do not include your email name in the password.");
  return issues;
}
