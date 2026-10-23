/**
 * GOV-03: the data contract file matches the live schema exactly (tables,
 * columns, types, nullability) and every field is classified.
 *
 * Requirements: GOV-03.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadDataContracts } from "../../src/index.js";
import { createDatabase, type TestDb } from "./support.js";

let db: TestDb;
beforeAll(async () => {
  db = await createDatabase();
});
afterAll(async () => db?.close());

const contracts = loadDataContracts();

describe("data contracts vs schema", () => {
  it("cover exactly the tables in the database", async () => {
    const r = await db.admin.query<{ table_name: string }>("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name");
    expect(contracts.entities.map((e) => e.table).sort()).toEqual(r.rows.map((x) => x.table_name));
  });

  it.each(contracts.entities.map((e) => [e.table, e] as const))("%s: columns, types and nullability match", async (table, entity) => {
    const r = await db.admin.query<{ column_name: string; data_type: string; is_nullable: string }>(
      "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position",
      [table],
    );
    const actual = Object.fromEntries(r.rows.map((c) => [c.column_name, { type: c.data_type, nullable: c.is_nullable === "YES" }]));
    const expected = Object.fromEntries(Object.entries(entity.columns).map(([k, c]) => [k, { type: c.type, nullable: c.nullable }]));
    expect(actual).toEqual(expected);
  });

  it("tenant-scoped tables carry tenant_id; tables without runtime access have no runtime grants", async () => {
    for (const e of contracts.entities) {
      if (e.tenantScoped) expect(Object.keys(e.columns)).toContain("tenant_id");
      if (!e.runtimeAccess) {
        const g = await db.admin.query("SELECT 1 FROM information_schema.role_table_grants WHERE table_name = $1 AND grantee LIKE 'pl\\_%'", [e.table]);
        expect([e.table, g.rowCount]).toEqual([e.table, 0]);
      }
    }
  });
});

describe("contract content", () => {
  it("every column has a known classification and every entity a known retention class and owner", () => {
    const classes = Object.keys(contracts.classifications);
    expect(classes).toEqual(["public", "employee", "hr-restricted", "payroll-restricted", "medical"]);
    for (const e of contracts.entities) {
      expect(Object.keys(contracts.retentionClasses)).toContain(e.retentionClass);
      expect(["platform", "people", "time", "pay", "insight"]).toContain(e.owner);
      expect(e.constraints.length).toBeGreaterThan(0);
      for (const [name, c] of Object.entries(e.columns)) {
        expect([`${e.table}.${name}`, classes.includes(c.classification)]).toEqual([`${e.table}.${name}`, true]);
        expect(c.description.length).toBeGreaterThan(0);
      }
    }
  });
});
