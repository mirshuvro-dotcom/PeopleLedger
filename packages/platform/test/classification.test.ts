/**
 * Field classification and connection policy.
 * Requirements: NFR-01, AUD-03, GOV-03.
 */
import { describe, expect, it } from "vitest";
import { assertConnectionPolicy, auditDiff, isRestricted, redactRow } from "../src/index.js";

describe("field classification (NFR-01, AUD-03)", () => {
  it("redacts restricted and unknown fields in logs", () => {
    expect(redactRow("person_version", { legal_name_en: "Synthetic", birth_date: "1990-01-01", surprise: 1 })).toEqual({
      legal_name_en: "Synthetic",
      birth_date: "[redacted:hr-restricted]",
      surprise: "[redacted:unclassified]",
    });
  });

  it("treats unknown tables and columns as restricted (fail closed)", () => {
    expect(isRestricted("no_such_table", "x")).toBe(true);
    expect(isRestricted("person_version", "no_such_column")).toBe(true);
    expect(isRestricted("person_version", "legal_name_en")).toBe(false);
  });

  it("audit diffs carry only changed fields and never restricted values", () => {
    const d = auditDiff("person_version", { legal_name_en: "A", birth_date: "1990-01-01" }, { legal_name_en: "A", birth_date: "1991-01-01" });
    expect(d).toEqual({ before: { birth_date: { changed: true } }, after: { birth_date: { changed: true } } });
    expect(JSON.stringify(d)).not.toMatch(/199/);
  });
});

describe("connection policy (NFR-01)", () => {
  it("requires TLS in production", () => {
    expect(() => assertConnectionPolicy("postgres://u:p@db/x", "production")).toThrow(/sslmode/);
    expect(() => assertConnectionPolicy("postgres://u:p@db/x?sslmode=disable", "production")).toThrow(/sslmode/);
    expect(() => assertConnectionPolicy("postgres://u:p@db/x?sslmode=verify-full", "production")).not.toThrow();
    expect(() => assertConnectionPolicy("postgres://u:p@localhost/x", "test")).not.toThrow();
  });
});
