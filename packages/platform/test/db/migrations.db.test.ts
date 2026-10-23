/**
 * ARCH-05: migrations apply and revert cleanly on empty and seeded databases;
 * edited migrations, destructive (contract) migrations and unflagged downs are
 * refused; concurrent runners do not interleave.
 *
 * Requirements: ARCH-05.
 */
import { cpSync, mkdtempSync, readdirSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { afterEach, describe, expect, it } from "vitest";
import { appliedMigrations, createLegalEntity, DEFAULT_MIGRATIONS_DIR, loadDataContracts, loadMigrations, migrateDown, migrateUp, withTenant } from "../../src/index.js";

/** Every table the migrations create, per the data contract (GOV-03). */
const TABLES = loadDataContracts().entities.length;
const VERSIONS = loadMigrations().map((m) => m.version);
const LATEST = VERSIONS[VERSIONS.length - 1]!;
import { urlFor } from "./env.js";
import { createDatabase, seedTenant, userCtx, type TestDb } from "./support.js";

const opened: TestDb[] = [];
afterEach(async () => {
  while (opened.length) await opened.pop()!.close();
});
async function emptyDb(): Promise<TestDb> {
  const db = await createDatabase({ migrate: false });
  opened.push(db);
  return db;
}

async function publicTables(db: TestDb): Promise<string[]> {
  return (await db.admin.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename")).rows.map((r) => r.tablename);
}
async function publicFunctions(db: TestDb): Promise<number> {
  const r = await db.admin.query<{ n: string }>(
    "SELECT count(*)::text AS n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'",
  );
  return Number(r.rows[0]!.n);
}
function tempMigrations(): string {
  const dir = mkdtempSync(join(tmpdir(), "pl-migrations-"));
  for (const f of readdirSync(DEFAULT_MIGRATIONS_DIR)) cpSync(join(DEFAULT_MIGRATIONS_DIR, f), join(dir, f));
  return dir;
}

describe("empty database", () => {
  it("applies every migration, reverts all of them, and applies again", async () => {
    const db = await emptyDb();
    const versions = loadMigrations().map((m) => m.version);
    expect(await migrateUp(db.admin)).toEqual(versions);
    expect(await migrateUp(db.admin)).toEqual([]);
    expect((await publicTables(db)).length).toBe(TABLES);

    expect(await migrateDown(db.admin, { steps: versions.length, allowDestructive: true })).toEqual([...versions].reverse());
    expect(await publicTables(db)).toEqual(["schema_migrations"]);
    expect(await publicFunctions(db)).toBe(0);
    expect(await appliedMigrations(db.admin)).toEqual([]);

    expect(await migrateUp(db.admin)).toEqual(versions);
  });

  it("every migration declares expand and an owning module", () => {
    for (const m of loadMigrations()) {
      expect(m.phase).toBe("expand");
      expect(["platform", "people"]).toContain(m.owner);
    }
  });
});

describe("seeded database", () => {
  it("reverts and re-applies the latest migration without touching earlier data", async () => {
    const db = await emptyDb();
    await migrateUp(db.admin);
    const t = await seedTenant(db, "Seeded");
    await withTenant(db.app, userCtx(t.tenantId), (tx) => createLegalEntity(tx, { legalNameEn: "Second Seeded Ltd" }));

    expect(await migrateDown(db.admin, { steps: 1, allowDestructive: true })).toEqual([LATEST]);
    expect(await publicTables(db)).not.toContain("auth_session");
    expect(await migrateUp(db.admin)).toEqual([LATEST]);

    const r = await db.admin.query("SELECT 1 FROM legal_entity WHERE tenant_id = $1", [t.tenantId]);
    expect(r.rowCount).toBe(2);
    const chain = await withTenant(db.app, userCtx(t.tenantId), (tx) => tx.query<{ ok: boolean }>("SELECT ok FROM audit_verify_chain($1)", [t.tenantId]));
    expect(chain.rows[0]!.ok).toBe(true);
  });

  it("can be fully reverted only with the destructive flag", async () => {
    const db = await emptyDb();
    await migrateUp(db.admin);
    await seedTenant(db, "Doomed");
    await expect(migrateDown(db.admin, { steps: VERSIONS.length, allowDestructive: false })).rejects.toThrow(/allowDestructive/);
    expect((await publicTables(db)).length).toBe(TABLES);
    await migrateDown(db.admin, { steps: VERSIONS.length, allowDestructive: true });
    expect(await publicTables(db)).toEqual(["schema_migrations"]);
    await migrateUp(db.admin);
    expect((await db.admin.query("SELECT 1 FROM tenant")).rowCount).toBe(0);
  });
});

describe("safety rails", () => {
  it("refuses to run when an applied migration was edited", async () => {
    const db = await emptyDb();
    const dir = tempMigrations();
    await migrateUp(db.admin, { dir });
    appendFileSync(join(dir, "0002_identity_org.up.sql"), "\n-- sneaky edit\n");
    await expect(migrateUp(db.admin, { dir })).rejects.toThrow(/checksum mismatch/);
  });

  it("refuses a contract (destructive) migration unless explicitly allowed", async () => {
    const db = await emptyDb();
    const dir = tempMigrations();
    writeFileSync(join(dir, "0099_drop_preferred_name.up.sql"), "-- phase: contract\n-- owner: people\nALTER TABLE person_version DROP COLUMN preferred_name;\n");
    writeFileSync(join(dir, "0099_drop_preferred_name.down.sql"), "ALTER TABLE person_version ADD COLUMN preferred_name text;\n");
    await expect(migrateUp(db.admin, { dir })).rejects.toThrow(/contract \(destructive\)/);
    expect(await appliedMigrations(db.admin)).toEqual([]);
    expect(await migrateUp(db.admin, { dir, allowContract: true })).toContain("0099");
  });

  it("rejects a migration without phase and owner headers", () => {
    const dir = tempMigrations();
    writeFileSync(join(dir, "0098_unlabelled.up.sql"), "SELECT 1;\n");
    writeFileSync(join(dir, "0098_unlabelled.down.sql"), "SELECT 1;\n");
    expect(() => loadMigrations(dir)).toThrow(/phase/);
  });

  it("a failing migration leaves nothing half-applied", async () => {
    const db = await emptyDb();
    const dir = tempMigrations();
    writeFileSync(join(dir, "0097_broken.up.sql"), "-- phase: expand\n-- owner: platform\nCREATE TABLE half_done (id int);\nSELECT no_such_function();\n");
    writeFileSync(join(dir, "0097_broken.down.sql"), "DROP TABLE half_done;\n");
    await expect(migrateUp(db.admin, { dir })).rejects.toThrow(/0097_broken failed/);
    expect(await publicTables(db)).not.toContain("half_done");
    // Earlier migrations committed; only the broken one is absent.
    expect((await appliedMigrations(db.admin)).map((m) => m.version)).toEqual(VERSIONS);
  });

  it("concurrent runners apply each migration once", async () => {
    const db = await emptyDb();
    const other = new pg.Client({ connectionString: urlFor(db.name) });
    await other.connect();
    try {
      const [a, b] = await Promise.all([migrateUp(db.admin), migrateUp(other)]);
      expect([...a, ...b].sort()).toEqual(loadMigrations().map((m) => m.version));
    } finally {
      await other.end();
    }
  });
});
