/**
 * ARCH-06, PRN-07, AC-01, RBAC-15: tenant A can never read, write or reference
 * tenant B rows, through any runtime table, join, pooled connection or worker.
 * Lives in the people package because it seeds person/employment rows through
 * the People repository.
 *
 * Requirements: ARCH-06, PRN-07, RBAC-15, SEC-01, GOV-03 (cross-tenant inputs rejected), AC-01.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  loadDataContracts,
  processOutboxBatch,
  withTenant,
  type OutboxHandler,
} from "@peopleledger/platform";
import { createDatabase, rejectsWithCode, seedFullTenant, userCtx, type FullTenant, type TestDb } from "../../platform/test/db/support.js";
import { createEmployment, createPerson } from "../src/index.js";

const people = { createPerson, createEmployment };
const runtimeTenantTables = loadDataContracts()
  .entities.filter((e) => e.tenantScoped && e.runtimeAccess)
  .map((e) => e.table);

let db: TestDb;
let A: FullTenant;
let B: FullTenant;

beforeAll(async () => {
  db = await createDatabase({ appPoolSize: 1 });
  A = await seedFullTenant(db, "A", people);
  B = await seedFullTenant(db, "B", people);
});
afterAll(async () => db?.close());

describe("reads", () => {
  it("covers every runtime tenant table from the data contract", () => {
    expect(runtimeTenantTables.sort()).toEqual(
      ["audit_event", "employment", "employment_version", "idempotency_key", "legal_entity", "membership", "outbox_event", "person", "person_version", "role", "role_assignment", "role_permission"].sort(),
    );
  });

  it.each(runtimeTenantTables)("%s: tenant A sees only its own rows", async (table) => {
    const rows = await withTenant(db.app, userCtx(A.tenantId), (tx) => tx.query<{ tenant_id: string }>(`SELECT tenant_id FROM ${table}`));
    expect(rows.rowCount).toBeGreaterThan(0);
    expect(new Set(rows.rows.map((r) => r.tenant_id))).toEqual(new Set([A.tenantId]));
  });

  it.each(runtimeTenantTables)("%s: no tenant context returns zero rows (fails closed)", async (table) => {
    const rows = await db.app.query(`SELECT * FROM ${table}`);
    expect(rows.rowCount).toBe(0);
  });

  it("tenant table shows only the current tenant", async () => {
    const rows = await withTenant(db.app, userCtx(A.tenantId), (tx) => tx.query<{ id: string }>("SELECT id FROM tenant"));
    expect(rows.rows.map((r) => r.id)).toEqual([A.tenantId]);
    expect((await db.app.query("SELECT id FROM tenant")).rowCount).toBe(0);
  });

  it("user accounts are visible only through the current tenant's memberships", async () => {
    const emails = await withTenant(db.app, userCtx(A.tenantId), (tx) => tx.query<{ email: string }>("SELECT email FROM user_account"));
    expect(emails.rows.map((r) => r.email)).toEqual(["member.a@example.test"]);
    expect((await db.app.query("SELECT * FROM user_account")).rowCount).toBe(0);
  });

  it("joins without tenant predicates still only return the current tenant's rows", async () => {
    const rows = await withTenant(db.app, userCtx(A.tenantId), (tx) =>
      tx.query<{ e_tenant: string; p_tenant: string; l_tenant: string }>(
        `SELECT e.tenant_id AS e_tenant, pv.tenant_id AS p_tenant, le.tenant_id AS l_tenant
         FROM employment e
         JOIN person_version pv ON pv.person_id = e.person_id
         JOIN legal_entity le ON le.id = e.legal_entity_id
         CROSS JOIN membership m`,
      ),
    );
    expect(rows.rowCount).toBeGreaterThan(0);
    for (const r of rows.rows) expect([r.e_tenant, r.p_tenant, r.l_tenant]).toEqual([A.tenantId, A.tenantId, A.tenantId]);
  });

  it("looking up tenant B's ids by primary key from tenant A finds nothing", async () => {
    const r = await withTenant(db.app, userCtx(A.tenantId), (tx) =>
      tx.query("SELECT 1 FROM person WHERE id = $1 UNION ALL SELECT 1 FROM employment WHERE id = $2 UNION ALL SELECT 1 FROM outbox_event WHERE id = $3", [
        B.personId,
        B.employmentId,
        B.outboxEventId,
      ]),
    );
    expect(r.rowCount).toBe(0);
  });
});

describe("writes", () => {
  const inA = <T>(fn: Parameters<typeof withTenant<T>>[2]) => withTenant(db.app, userCtx(A.tenantId), fn);

  it.each([
    ["legal_entity", "INSERT INTO legal_entity (tenant_id, legal_name_en) VALUES ($1, 'x')"],
    ["person", "INSERT INTO person (tenant_id) VALUES ($1)"],
    ["role", "INSERT INTO role (tenant_id, name) VALUES ($1, 'x')"],
    ["outbox_event", "INSERT INTO outbox_event (tenant_id, topic, dedupe_key, payload, correlation_id) VALUES ($1, 'x.y.z', 'k', '{}', 'c')"],
    ["idempotency_key", "INSERT INTO idempotency_key (tenant_id, scope, key) VALUES ($1, 'abc', 'k')"],
    ["audit_event", "INSERT INTO audit_event (tenant_id, occurred_at, category, action, actor_type, actor_id, resource_type, result, source, correlation_id) VALUES ($1, now(), 'system', 'x.test', 'user', 'u', 'thing', 'success', 'api', 'c')"],
  ])("%s: inserting a row for tenant B from tenant A is denied", async (_table, sql) => {
    await rejectsWithCode(inA((tx) => tx.query(sql, [B.tenantId])), "PERMISSION_DENIED");
  });

  it("updates and deletes aimed at tenant B rows affect nothing", async () => {
    const counts = await inA(async (tx) => [
      (await tx.query("UPDATE legal_entity SET legal_name_en = 'hijack', version = version + 1 WHERE id = $1", [B.legalEntityId])).rowCount,
      (await tx.query("UPDATE membership SET status = 'revoked', version = version + 1 WHERE id = $1", [B.membershipId])).rowCount,
      (await tx.query("UPDATE role_assignment SET effective_to = '2026-07-02', version = version + 1 WHERE id = $1", [B.roleAssignmentId])).rowCount,
      (await tx.query("DELETE FROM role_permission WHERE role_id = $1", [B.roleId])).rowCount,
    ]);
    expect(counts).toEqual([0, 0, 0, 0]);
  });

  it.each([
    ["employment -> B person", "INSERT INTO employment (person_id, legal_entity_id, employee_code, hire_date) VALUES ($1, $2, 'X1', '2026-07-01')", () => [B.personId, A.legalEntityId]],
    ["employment -> B legal entity", "INSERT INTO employment (person_id, legal_entity_id, employee_code, hire_date) VALUES ($1, $2, 'X2', '2026-07-01')", () => [A.personId, B.legalEntityId]],
    ["person_version -> B person", "INSERT INTO person_version (person_id, effective_from, legal_name_en) VALUES ($1, '2027-01-01', 'x')", () => [B.personId]],
    ["role_assignment -> B membership", "INSERT INTO role_assignment (membership_id, role_id, scope_type, effective_from, reason) VALUES ($1, $2, 'tenant', '2026-07-01', 'x')", () => [B.membershipId, A.roleId]],
    ["role_assignment -> B role", "INSERT INTO role_assignment (membership_id, role_id, scope_type, effective_from, reason) VALUES ($1, $2, 'tenant', '2026-07-01', 'x')", () => [A.membershipId, B.roleId]],
    ["role_permission -> B role", "INSERT INTO role_permission (role_id, permission_code) VALUES ($1, 'person:view')", () => [B.roleId]],
  ] as const)("referencing %s is impossible (composite foreign key)", async (_name, sql, params) => {
    await rejectsWithCode(inA((tx) => tx.query(sql, params())), "REFERENCE_NOT_FOUND");
  });

  it("cross-tenant references are impossible even for the table owner bypassing RLS", async () => {
    await db.admin.query("BEGIN");
    try {
      await db.admin.query("SELECT set_config('app.actor_id', 'admin:test', true)");
      await rejectsWithCode(
        db.admin.query("INSERT INTO employment (tenant_id, person_id, legal_entity_id, employee_code, hire_date) VALUES ($1, $2, $3, 'X9', '2026-07-01')", [
          A.tenantId,
          B.personId,
          A.legalEntityId,
        ]),
        "23503",
      );
    } finally {
      await db.admin.query("ROLLBACK");
    }
  });

  it("writes without tenant context fail closed", async () => {
    await expect(db.app.query("INSERT INTO legal_entity (legal_name_en) VALUES ('no context')")).rejects.toThrow();
    await expect(db.app.query("SELECT membership_invite('x@example.test')")).rejects.toThrow(/tenant context required/);
  });
});

describe("pooled connections (pool size 1, so every call reuses one connection)", () => {
  it("context is cleared after commit", async () => {
    await withTenant(db.app, userCtx(A.tenantId), (tx) => tx.query("SELECT 1"));
    const r = await db.app.query<{ t: string; n: string }>("SELECT current_setting('app.tenant_id', true) AS t, (SELECT count(*) FROM person)::text AS n");
    expect(r.rows[0]).toEqual({ t: "", n: "0" });
  });

  it("context is cleared after a failed transaction, and the next tenant sees only its data", async () => {
    await expect(withTenant(db.app, userCtx(A.tenantId), async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    const seen = await withTenant(db.app, userCtx(B.tenantId), (tx) => tx.query<{ tenant_id: string }>("SELECT DISTINCT tenant_id FROM person"));
    expect(seen.rows.map((r) => r.tenant_id)).toEqual([B.tenantId]);
  });

  it("alternating tenants on the same connection never mix", async () => {
    for (let i = 0; i < 10; i++) {
      const t = i % 2 === 0 ? A : B;
      const r = await withTenant(db.app, userCtx(t.tenantId), (tx) => tx.query<{ tenant_id: string }>("SELECT DISTINCT tenant_id FROM legal_entity"));
      expect(r.rows.map((x) => x.tenant_id)).toEqual([t.tenantId]);
    }
  });

  it("a connection carrying session-level context is discarded and the call fails closed", async () => {
    const client = await db.app.connect();
    await client.query(`SET app.tenant_id = '${A.tenantId}'`);
    client.release();
    await rejectsWithCode(withTenant(db.app, userCtx(B.tenantId), (tx) => tx.query("SELECT 1")), "TENANT_CONTEXT");
    const r = await withTenant(db.app, userCtx(B.tenantId), (tx) => tx.query<{ tenant_id: string }>("SELECT DISTINCT tenant_id FROM person"));
    expect(r.rows.map((x) => x.tenant_id)).toEqual([B.tenantId]);
  });
});

describe("workers", () => {
  it("process each event inside its own tenant and cannot see other tenants' data", async () => {
    await db.admin.query(`
      CREATE TABLE test_effect (
        tenant_id uuid NOT NULL DEFAULT app_current_tenant() REFERENCES tenant (id),
        event_id uuid NOT NULL,
        visible_people integer NOT NULL,
        visible_tenants integer NOT NULL
      );
      SELECT app_enable_tenant_rls('test_effect');
      GRANT SELECT, INSERT ON test_effect TO pl_app;`);
    const handler: OutboxHandler = {
      name: "isolation-probe",
      topic: "employment.created",
      async handle(tx, event) {
        await tx.query(
          "INSERT INTO test_effect (event_id, visible_people, visible_tenants) SELECT $1, (SELECT count(*) FROM person), (SELECT count(DISTINCT tenant_id) FROM person_version)",
          [event.id],
        );
      },
    };
    const result = await processOutboxBatch(db.worker, { workerId: "iso-1", handlers: [handler] });
    expect(result.done).toBe(2);
    for (const t of [A, B]) {
      const r = await withTenant(db.app, userCtx(t.tenantId), (tx) => tx.query("SELECT event_id, visible_people, visible_tenants FROM test_effect"));
      expect(r.rows).toEqual([{ event_id: t.outboxEventId, visible_people: 1, visible_tenants: 1 }]);
    }
  });

  it("the outbox claim returns identifiers only, never payloads", async () => {
    const r = await db.worker.query("SELECT * FROM outbox_claim('probe', 10, 5)");
    expect(r.fields.map((f) => f.name)).toEqual(["tenant_id", "id", "topic", "attempts"]);
  });
});

describe("role posture (RBAC-15, ARCH-06)", () => {
  it("runtime roles are not superusers, cannot bypass RLS and own nothing", async () => {
    const roles = await db.admin.query<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean }>(
      "SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname LIKE 'pl\\_%' ORDER BY rolname",
    );
    expect(roles.rowCount).toBeGreaterThanOrEqual(6);
    for (const r of roles.rows) expect([r.rolname, r.rolsuper, r.rolbypassrls]).toEqual([r.rolname, false, false]);
    const owned = await db.admin.query("SELECT relname FROM pg_class c JOIN pg_roles r ON r.oid = c.relowner WHERE r.rolname LIKE 'pl\\_%'");
    expect(owned.rowCount).toBe(0);
  });

  it("every runtime tenant table has RLS enabled with a tenant policy", async () => {
    const r = await db.admin.query<{ relname: string; relrowsecurity: boolean; policies: string }>(
      `SELECT c.relname, c.relrowsecurity, (SELECT count(*) FROM pg_policies p WHERE p.tablename = c.relname)::text AS policies
       FROM pg_class c WHERE c.relname = ANY($1)`,
      [runtimeTenantTables],
    );
    expect(r.rowCount).toBe(runtimeTenantTables.length);
    for (const row of r.rows) {
      expect(row.relrowsecurity).toBe(true);
      expect(Number(row.policies)).toBeGreaterThan(0);
    }
  });

  it("the platform role sees tenant metadata but no tenant data", async () => {
    expect((await db.platform.query("SELECT id FROM tenant")).rowCount).toBe(2);
    for (const table of ["person", "employment", "membership", "audit_event", "user_account", "outbox_event"]) {
      await rejectsWithCode(db.platform.query(`SELECT * FROM ${table}`), "42501");
    }
    await rejectsWithCode(db.platform.query("INSERT INTO tenant (name, environment, created_by) VALUES ('x', 'sandbox', 'p')"), "42501");
  });

  it("app and worker roles cannot use platform or internal functions and tables", async () => {
    await rejectsWithCode(db.app.query("SELECT provision_tenant('x', 'sandbox')"), "42501");
    await rejectsWithCode(db.app.query("SELECT * FROM outbox_claim('w', 1, 1)"), "42501");
    await rejectsWithCode(db.worker.query("SELECT provision_tenant('x', 'sandbox')"), "42501");
    for (const table of ["audit_chain_head", "schema_migrations"]) {
      await rejectsWithCode(db.app.query(`SELECT * FROM ${table}`), "42501");
      await rejectsWithCode(db.worker.query(`SELECT * FROM ${table}`), "42501");
    }
  });
});
