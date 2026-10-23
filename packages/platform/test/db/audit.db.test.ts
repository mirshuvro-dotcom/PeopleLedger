/**
 * AUD-01..AUD-09, NFR-03: append-only, hash-chained audit trail; tampering is
 * detected; a sensitive change cannot commit without an audit event; a failed
 * audit write aborts the business action.
 *
 * Requirements: AUD-01, AUD-02, AUD-03, AUD-04, AUD-06, AUD-08, AUD-09, NFR-03.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assignRole,
  createLegalEntity,
  createRole,
  verifyAuditChain,
  withTenant,
  writeAudit,
  type AuditCategory,
} from "../../src/index.js";
import { createDatabase, rejectsWithCode, seedTenant, userCtx, type SeededTenant, type TestDb } from "./support.js";

let db: TestDb;
let A: SeededTenant;

beforeAll(async () => {
  db = await createDatabase();
  A = await seedTenant(db, "A");
});
afterAll(async () => db?.close());

const inTenant = <T>(t: SeededTenant, fn: Parameters<typeof withTenant<T>>[2]) => withTenant(db.app, userCtx(t.tenantId), fn);

/** Simulate a privileged attacker: superuser with triggers disabled. */
async function asAttacker(sql: string, params: unknown[] = []): Promise<void> {
  await db.admin.query("SET session_replication_role = replica");
  try {
    await db.admin.query(sql, params);
  } finally {
    await db.admin.query("SET session_replication_role = origin");
  }
}

describe("hash chain (AUD-06)", () => {
  it("is gapless, linked and verifies after normal activity", async () => {
    const rows = await inTenant(A, (tx) => tx.query<{ seq: string; prev_hash: string; hash: string }>("SELECT seq::text, prev_hash, hash FROM audit_event ORDER BY seq"));
    expect(rows.rows.map((r) => Number(r.seq))).toEqual([1, 2, 3]);
    expect(rows.rows[0]!.prev_hash).toBe("0".repeat(64));
    for (let i = 1; i < rows.rows.length; i++) expect(rows.rows[i]!.prev_hash).toBe(rows.rows[i - 1]!.hash);
    expect(await inTenant(A, verifyAuditChain)).toEqual({ ok: true, checked: 3, firstBadSeq: null, problem: null });
  });

  it("stays gapless under concurrent writers", async () => {
    const t = await seedTenant(db, "Concurrent");
    await Promise.all(Array.from({ length: 25 }, (_, i) => inTenant(t, (tx) => createLegalEntity(tx, { legalNameEn: `Entity ${i}` }))));
    const v = await inTenant(t, verifyAuditChain);
    expect(v).toEqual({ ok: true, checked: 28, firstBadSeq: null, problem: null });
  });

  it("ignores client-supplied seq, hashes, txid and recorded_at", async () => {
    const t = await seedTenant(db, "Forge");
    await inTenant(t, async (tx) => {
      await tx.query(
        `INSERT INTO audit_event (occurred_at, recorded_at, txid, seq, prev_hash, hash, category, action, actor_type, actor_id, resource_type, result, source, correlation_id)
         VALUES ('2020-01-01', '2020-01-01', 1, 999, repeat('f', 64), repeat('f', 64), 'system', 'forge.attempt', 'user', 'u', 'thing', 'success', 'api', 'c')`,
      );
    });
    const r = await inTenant(t, (tx) => tx.query<{ seq: string; hash: string; recorded_at: Date }>("SELECT seq::text, hash, recorded_at FROM audit_event WHERE action = 'forge.attempt'"));
    expect(r.rows[0]!.seq).toBe("4");
    expect(r.rows[0]!.hash).not.toBe("f".repeat(64));
    expect(r.rows[0]!.recorded_at.getUTCFullYear()).toBeGreaterThanOrEqual(2026);
    expect((await inTenant(t, verifyAuditChain)).ok).toBe(true);
  });

  it("only verifies the current tenant's chain", async () => {
    const B = await seedTenant(db, "Other");
    await rejectsWithCode(inTenant(A, (tx) => tx.query("SELECT * FROM audit_verify_chain($1)", [B.tenantId])), "PERMISSION_DENIED");
  });
});

describe("append-only (AUD-06)", () => {
  it.each([
    ["UPDATE", "UPDATE audit_event SET action = 'x.changed'"],
    ["DELETE", "DELETE FROM audit_event"],
    ["TRUNCATE", "TRUNCATE audit_event"],
  ])("app role cannot %s audit rows", async (_op, sql) => {
    await rejectsWithCode(inTenant(A, (tx) => tx.query(sql)), "PERMISSION_DENIED");
    await rejectsWithCode(withTenant(db.worker, userCtx(A.tenantId), (tx) => tx.query(sql)), "PERMISSION_DENIED");
  });

  it.each([
    ["UPDATE", "UPDATE audit_event SET action = 'x.changed'"],
    ["DELETE", "DELETE FROM audit_event"],
    ["TRUNCATE", "TRUNCATE audit_event"],
  ])("even the table owner cannot %s while triggers are active", async (_op, sql) => {
    await rejectsWithCode(db.admin.query(sql), "PL005");
  });
});

describe("tamper detection", () => {
  it("detects an edited row", async () => {
    const t = await seedTenant(db, "T1");
    await asAttacker("UPDATE audit_event SET reason = 'covered up' WHERE tenant_id = $1 AND seq = 2", [t.tenantId]);
    expect(await inTenant(t, verifyAuditChain)).toEqual({ ok: false, checked: 2, firstBadSeq: 2, problem: "content does not match hash" });
  });

  it("detects an edited row whose hash was recomputed (breaks the next link)", async () => {
    const t = await seedTenant(db, "T2");
    await asAttacker(
      `UPDATE audit_event e SET reason = 'covered up' WHERE tenant_id = $1 AND seq = 2;
       UPDATE audit_event e SET hash = audit_event_hash(e) WHERE tenant_id = $1 AND seq = 2;`.replace(/\$1/g, `'${t.tenantId}'`),
    );
    expect(await inTenant(t, verifyAuditChain)).toEqual({ ok: false, checked: 3, firstBadSeq: 3, problem: "broken link to previous event" });
  });

  it("detects a deleted middle row", async () => {
    const t = await seedTenant(db, "T3");
    await asAttacker("DELETE FROM audit_event WHERE tenant_id = $1 AND seq = 2", [t.tenantId]);
    expect(await inTenant(t, verifyAuditChain)).toEqual({ ok: false, checked: 2, firstBadSeq: 2, problem: "sequence gap" });
  });

  it("detects a deleted tail row through the chain head", async () => {
    const t = await seedTenant(db, "T4");
    await asAttacker("DELETE FROM audit_event WHERE tenant_id = $1 AND seq = 3", [t.tenantId]);
    expect(await inTenant(t, verifyAuditChain)).toEqual({ ok: false, checked: 2, firstBadSeq: 3, problem: "chain head mismatch (missing tail events)" });
  });
});

describe("no unlogged sensitive change (AUD-08)", () => {
  it("refuses to commit a change without an audit event in the same transaction", async () => {
    await rejectsWithCode(inTenant(A, (tx) => tx.query("INSERT INTO legal_entity (legal_name_en) VALUES ('Unaudited Ltd')")), "AUDIT_REQUIRED");
    const r = await inTenant(A, (tx) => tx.query("SELECT 1 FROM legal_entity WHERE legal_name_en = 'Unaudited Ltd'"));
    expect(r.rowCount).toBe(0);
  });

  it("an audit event for a different resource does not count", async () => {
    await rejectsWithCode(
      inTenant(A, async (tx) => {
        await tx.query("INSERT INTO legal_entity (legal_name_en) VALUES ('Wrong Audit Ltd')");
        await writeAudit(tx, { category: "data-change", action: "legal_entity.created", resourceType: "legal_entity", resourceId: A.legalEntityId });
      }),
      "AUDIT_REQUIRED",
    );
  });

  it("covers updates too", async () => {
    await rejectsWithCode(
      inTenant(A, (tx) => tx.query("UPDATE legal_entity SET legal_name_en = 'Silent rename', version = version + 1 WHERE id = $1", [A.legalEntityId])),
      "AUDIT_REQUIRED",
    );
  });

  it("a failed audit write aborts the business action", async () => {
    await expect(
      inTenant(A, async (tx) => {
        await createLegalEntity(tx, { legalNameEn: "Doomed Ltd" });
        await writeAudit(tx, { category: "not-a-category" as AuditCategory, action: "x.fail", resourceType: "thing", resourceId: null });
      }),
    ).rejects.toMatchObject({ code: "CONSTRAINT_VIOLATION" });
    const r = await inTenant(A, (tx) => tx.query("SELECT 1 FROM legal_entity WHERE legal_name_en = 'Doomed Ltd'"));
    expect(r.rowCount).toBe(0);
  });
});

describe("event content (AUD-02, AUD-03, AUD-09)", () => {
  it("records actor, tenant, target, source, client, correlation and both clocks", async () => {
    const ctx = { ...userCtx(A.tenantId), requestId: "req-123" };
    const id = await withTenant(db.app, ctx, (tx) => createLegalEntity(tx, { legalNameEn: "Audited Ltd" }));
    const r = await withTenant(db.app, ctx, (tx) =>
      tx.query("SELECT * FROM audit_event WHERE resource_id = $1 AND action = 'legal_entity.created'", [id]),
    );
    const e = r.rows[0] as Record<string, unknown>;
    expect(e).toMatchObject({
      tenant_id: A.tenantId,
      category: "configuration",
      actor_type: "user",
      actor_id: ctx.actor.id,
      resource_type: "legal_entity",
      resource_id: id,
      result: "success",
      source: "api",
      ip_address: "192.0.2.10",
      user_agent: "vitest",
      request_id: "req-123",
      correlation_id: ctx.correlationId,
      after_ref: { legal_name_en: "Audited Ltd", legal_name_bn: null },
    });
    expect(e.occurred_at).toBeInstanceOf(Date);
    expect(e.recorded_at).toBeInstanceOf(Date);
  });

  it("stores restricted fields as change markers, never values", async () => {
    const roleId = await inTenant(A, (tx) => createRole(tx, { name: "Auditor", permissions: ["audit_event:view"] }));
    const id = await inTenant(A, (tx) =>
      assignRole(tx, { membershipId: A.membershipId, roleId, scope: { type: "tenant" }, effectiveFrom: "2026-07-01", reason: "synthetic" }),
    );
    const r = await inTenant(A, (tx) => tx.query<{ after_ref: Record<string, unknown> }>("SELECT after_ref FROM audit_event WHERE resource_id = $1", [id]));
    expect(r.rows[0]!.after_ref).toEqual({
      membership_id: { changed: true },
      role_id: { changed: true },
      scope_type: { changed: true },
      scope_legal_entity_id: { changed: true },
      effective_from: { changed: true },
      effective_to: { changed: true },
    });
    expect(JSON.stringify(r.rows[0])).not.toContain("2026-07-01");
  });
});
