import { createHash } from "node:crypto";

/**
 * Deterministic JSON: object keys sorted recursively, no whitespace. Used for
 * rule-pack content hashes and calculation trace hashes (PRN-01, Section 14.3).
 * Only JSON-safe values are accepted; `undefined` object members are dropped
 * exactly as JSON.stringify would.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function canonicalHash(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = sortKeys(v);
    }
    return out;
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("Non-finite number cannot be canonicalized");
  }
  return value;
}
