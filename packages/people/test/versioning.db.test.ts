/**
 * EMP-08 storage pattern and ARCH-05 optimistic versioning for person and
 * employment; GOV-03 representative invalid inputs; AUD-03 for a restricted
 * field (birth date).
 *
 * Requirements: ARCH-05, GOV-03, AUD-03, EMP-08.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@peopleledger/platform";
import { createDatabase, rejectsWithCode, seedTenant, userCtx, type SeededTenant, type TestDb } from "../../platform/test/db/support.js";
import { appendPersonVersion, createEmployment, createPerson } from "../src/index.js";

let db: TestDb;
let A: SeededTenant;

beforeAll(async () => {
  db = await createDatabase();
  A = await seedTenant(db, "A");
});
afterAll(async () => db?.close());

const inA = <T>(fn: Parameters<typeof withTenant<T>>[2], ctx = userCtx(A.tenantId)) => withTenant(db.app, ctx, fn);

describe("person versions", () => {
  it("appending closes the open version the day before and keeps history", async () => {
    const { personId } = await inA((tx) => createPerson(tx, { legalNameEn: "Synthetic One", effectiveFrom: "2026-07-01" }));
    const ctx = userCtx(A.tenantId);
    const r = await inA((tx) => appendPersonVersion(tx, { personId, expectedVersion: 1, effectiveFrom: "2027-03-01", legalNameEn: "Synthetic One-Renamed" }), ctx);
    expect(r.version).toBe(2);
    const rows = await inA((tx) =>
      tx.query("SELECT effective_from, effective_to, legal_name_en, recorded_by FROM person_version WHERE person_id = $1 ORDER BY effective_from", [personId]),
    );
    expect(rows.rows).toEqual([
      { effective_from: "2026-07-01", effective_to: "2027-02-28", legal_name_en: "Synthetic One", recorded_by: expect.stringMatching(/^user:/) },
      { effective_from: "2027-03-01", effective_to: null, legal_name_en: "Synthetic One-Renamed", recorded_by: ctx.actor.id },
    ]);
  });

  it("a stale expected version is rejected and writes nothing", async () => {
    const { personId } = await inA((tx) => createPerson(tx, { legalNameEn: "Stale", effectiveFrom: "2026-07-01" }));
    await inA((tx) => appendPersonVersion(tx, { personId, expectedVersion: 1, effectiveFrom: "2026-09-01", legalNameEn: "Stale 2" }));
    await rejectsWithCode(inA((tx) => appendPersonVersion(tx, { personId, expectedVersion: 1, effectiveFrom: "2026-10-01", legalNameEn: "Lost update" })), "STALE_VERSION");
    const n = await inA((tx) => tx.query("SELECT 1 FROM person_version WHERE person_id = $1", [personId]));
    expect(n.rowCount).toBe(2);
  });

  it("concurrent appends from the same version: exactly one succeeds", async () => {
    const { personId } = await inA((tx) => createPerson(tx, { legalNameEn: "Race", effectiveFrom: "2026-07-01" }));
    const results = await Promise.allSettled(
      ["2026-08-01", "2026-09-01", "2026-10-01"].map((d) => inA((tx) => appendPersonVersion(tx, { personId, expectedVersion: 1, effectiveFrom: d, legalNameEn: `Race ${d}` }))),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const n = await inA((tx) => tx.query("SELECT 1 FROM person_version WHERE person_id = $1", [personId]));
    expect(n.rowCount).toBe(2);
  });

  it("refuses backdating before the open version (a correction workflow, not an append)", async () => {
    const { personId } = await inA((tx) => createPerson(tx, { legalNameEn: "Backdate", effectiveFrom: "2026-07-01" }));
    await expect(inA((tx) => appendPersonVersion(tx, { personId, expectedVersion: 1, effectiveFrom: "2026-06-01", legalNameEn: "Earlier" }))).rejects.toMatchObject({
      code: "CONSTRAINT_VIOLATION",
    });
  });

  it("closed history cannot be reopened or rewritten", async () => {
    const { personId } = await inA((tx) => createPerson(tx, { legalNameEn: "Closed", effectiveFrom: "2026-07-01" }));
    await inA((tx) => appendPersonVersion(tx, { personId, expectedVersion: 1, effectiveFrom: "2026-08-01", legalNameEn: "Closed 2" }));
    await rejectsWithCode(
      inA((tx) => tx.query("UPDATE person_version SET effective_to = NULL WHERE person_id = $1 AND effective_to IS NOT NULL", [personId])),
      "IMMUTABLE_RECORD",
    );
    await rejectsWithCode(inA((tx) => tx.query("UPDATE person_version SET legal_name_en = 'Rewritten' WHERE person_id = $1", [personId])), "PERMISSION_DENIED");
    await rejectsWithCode(inA((tx) => tx.query("DELETE FROM person_version WHERE person_id = $1", [personId])), "PERMISSION_DENIED");
  });

  it("overlapping versions are rejected by the database", async () => {
    const { personId } = await inA((tx) => createPerson(tx, { legalNameEn: "Overlap", effectiveFrom: "2026-07-01" }));
    await rejectsWithCode(
      inA((tx) => tx.query("INSERT INTO person_version (person_id, effective_from, legal_name_en) VALUES ($1, '2026-12-01', 'Overlap 2')", [personId])),
      "EFFECTIVE_RANGE_OVERLAP",
    );
  });

  it("audits a birth date change as a marker, never the value (AUD-03)", async () => {
    const { personId } = await inA((tx) => createPerson(tx, { legalNameEn: "Private", effectiveFrom: "2026-07-01", birthDate: "1991-02-03" }));
    await inA((tx) => appendPersonVersion(tx, { personId, expectedVersion: 1, effectiveFrom: "2026-08-01", legalNameEn: "Private", birthDate: "1991-03-02" }));
    const events = await inA((tx) => tx.query<{ action: string; before_ref: unknown; after_ref: Record<string, unknown> }>(
      "SELECT action, before_ref, after_ref FROM audit_event WHERE resource_id = $1 ORDER BY seq", [personId]));
    expect(events.rows.map((e) => e.action)).toEqual(["person.created", "person.version_added"]);
    expect(events.rows[1]!.after_ref).toMatchObject({ birth_date: { changed: true }, effective_from: "2026-08-01" });
    expect(events.rows[1]!.after_ref).not.toHaveProperty("legal_name_en");
    const text = JSON.stringify(events.rows);
    expect(text).not.toContain("1991");
  });
});

describe("employment", () => {
  it("creates an anchor and a first version from the hire date", async () => {
    const { personId } = await inA((tx) => createPerson(tx, { legalNameEn: "Hire", effectiveFrom: "2026-07-01" }));
    const { employmentId } = await inA((tx) => createEmployment(tx, { personId, legalEntityId: A.legalEntityId, employeeCode: "E-100", hireDate: "2026-07-15", jobTitle: "Analyst" }));
    const v = await inA((tx) => tx.query("SELECT effective_from, effective_to, job_title FROM employment_version WHERE employment_id = $1", [employmentId]));
    expect(v.rows).toEqual([{ effective_from: "2026-07-15", effective_to: null, job_title: "Analyst" }]);
  });

  it.each([
    ["duplicate employee code in the same entity", "E-100", "2026-07-01", "DUPLICATE"],
    ["badly formed employee code", "has spaces", "2026-07-01", "CONSTRAINT_VIOLATION"],
  ])("rejects %s", async (_name, code, hire, expected) => {
    const { personId } = await inA((tx) => createPerson(tx, { legalNameEn: "Invalid", effectiveFrom: "2026-07-01" }));
    await rejectsWithCode(inA((tx) => createEmployment(tx, { personId, legalEntityId: A.legalEntityId, employeeCode: code, hireDate: hire, jobTitle: "x" })), expected);
  });

  it("rejects an end date before the hire date", async () => {
    const { personId } = await inA((tx) => createPerson(tx, { legalNameEn: "End", effectiveFrom: "2026-07-01" }));
    const { employmentId } = await inA((tx) => createEmployment(tx, { personId, legalEntityId: A.legalEntityId, employeeCode: "E-END", hireDate: "2026-07-01", jobTitle: "x" }));
    await rejectsWithCode(inA((tx) => tx.query("UPDATE employment SET end_date = '2026-06-30', version = version + 1 WHERE id = $1", [employmentId])), "CONSTRAINT_VIOLATION");
  });
});
