/**
 * GOV-02 state contracts (membership, role assignment) with positive and denial
 * tests including stale revisions and self-approval; ARCH-05 optimistic
 * versioning; SEC-01 deny-by-default authorization over the permission
 * catalogue (RBAC-16 at the data layer).
 *
 * Requirements: GOV-02, ARCH-05, ARCH-06 (application authorization), SEC-01, RBAC-16, NFR-11.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assignRole,
  businessDateInDhaka,
  changeMembershipStatus,
  createRole,
  endRoleAssignment,
  hasPermission,
  inviteMember,
  withTenant,
  writeAudit,
  createLegalEntity,
} from "../../src/index.js";
import { createDatabase, rejectsWithCode, seedTenant, userCtx, type SeededTenant, type TestDb } from "./support.js";

let db: TestDb;
let A: SeededTenant;

beforeAll(async () => {
  db = await createDatabase();
  A = await seedTenant(db, "A");
});
afterAll(async () => db?.close());

const admin = () => userCtx(A.tenantId);
const inA = <T>(fn: Parameters<typeof withTenant<T>>[2], ctx = admin()) => withTenant(db.app, ctx, fn);

async function newMember(label: string): Promise<{ membershipId: string; userId: string }> {
  return inA((tx) => inviteMember(tx, `${label}.${randomUUID().slice(0, 8)}@example.test`));
}

describe("membership state contract", () => {
  it("follows invited -> active -> suspended -> active -> revoked", async () => {
    const m = await newMember("flow");
    let v = 1;
    for (const status of ["active", "suspended", "active", "revoked"] as const) {
      v = await inA((tx) => changeMembershipStatus(tx, { membershipId: m.membershipId, expectedVersion: v, status, reason: "synthetic" }));
    }
    expect(v).toBe(5);
  });

  it.each([
    ["invited", "suspended"],
    ["revoked", "active"],
  ] as const)("rejects %s -> %s", async (from, to) => {
    const m = await newMember("bad");
    let v = 1;
    if (from === "revoked") v = await inA((tx) => changeMembershipStatus(tx, { membershipId: m.membershipId, expectedVersion: v, status: "revoked", reason: "x" }));
    await rejectsWithCode(inA((tx) => changeMembershipStatus(tx, { membershipId: m.membershipId, expectedVersion: v, status: to, reason: "x" })), "INVALID_TRANSITION");
  });

  it("lets a user accept their own invitation but not change their own status otherwise", async () => {
    const m = await newMember("self");
    const self = userCtx(A.tenantId, m.userId);
    const v = await inA((tx) => changeMembershipStatus(tx, { membershipId: m.membershipId, expectedVersion: 1, status: "active", reason: "accepted" }), self);
    await rejectsWithCode(inA((tx) => changeMembershipStatus(tx, { membershipId: m.membershipId, expectedVersion: v, status: "suspended", reason: "x" }), self), "SELF_APPROVAL_DENIED");
  });

  it("rejects a stale revision", async () => {
    const m = await newMember("stale");
    await inA((tx) => changeMembershipStatus(tx, { membershipId: m.membershipId, expectedVersion: 1, status: "active", reason: "x" }));
    await rejectsWithCode(inA((tx) => changeMembershipStatus(tx, { membershipId: m.membershipId, expectedVersion: 1, status: "revoked", reason: "x" })), "STALE_VERSION");
  });

  it("rejects an update that does not advance the version by exactly one", async () => {
    const m = await newMember("skip");
    await rejectsWithCode(
      inA(async (tx) => {
        await tx.query("UPDATE membership SET status = 'active', version = version + 2 WHERE id = $1", [m.membershipId]);
        await writeAudit(tx, { category: "security", action: "membership.status_changed", resourceType: "membership", resourceId: m.membershipId });
      }),
      "STALE_VERSION",
    );
  });

  it("concurrent updates with the same expected version: exactly one wins", async () => {
    const m = await newMember("race");
    const results = await Promise.allSettled(
      [1, 2, 3].map(() => inA((tx) => changeMembershipStatus(tx, { membershipId: m.membershipId, expectedVersion: 1, status: "active", reason: "race" }))),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results.filter((x) => x.status === "rejected")) expect((r as PromiseRejectedResult).reason.code).toBe("STALE_VERSION");
  });
});

describe("role assignment contract", () => {
  it("blocks self-assignment and changes to one's own assignment", async () => {
    const m = await newMember("selfrole");
    const roleId = await inA((tx) => createRole(tx, { name: `Self ${randomUUID().slice(0, 6)}`, permissions: [] }));
    const self = userCtx(A.tenantId, m.userId);
    await rejectsWithCode(
      inA((tx) => assignRole(tx, { membershipId: m.membershipId, roleId, scope: { type: "tenant" }, effectiveFrom: "2026-07-01", reason: "self" }), self),
      "SELF_APPROVAL_DENIED",
    );
    const id = await inA((tx) => assignRole(tx, { membershipId: m.membershipId, roleId, scope: { type: "tenant" }, effectiveFrom: "2026-07-01", reason: "by admin" }));
    await rejectsWithCode(inA((tx) => endRoleAssignment(tx, { id, expectedVersion: 1, effectiveTo: "2099-12-31", reason: "extend self" }), self), "SELF_APPROVAL_DENIED");
  });

  it("rejects overlapping intervals for the same member, role and scope", async () => {
    const m = await newMember("overlap");
    const roleId = await inA((tx) => createRole(tx, { name: `Overlap ${randomUUID().slice(0, 6)}`, permissions: [] }));
    const base = { membershipId: m.membershipId, roleId, scope: { type: "tenant" } as const, reason: "x" };
    await inA((tx) => assignRole(tx, { ...base, effectiveFrom: "2026-07-01", effectiveTo: "2026-12-31" }));
    await rejectsWithCode(inA((tx) => assignRole(tx, { ...base, effectiveFrom: "2026-12-31" })), "EFFECTIVE_RANGE_OVERLAP");
    await inA((tx) => assignRole(tx, { ...base, effectiveFrom: "2027-01-01" }));
  });

  it("rejects invalid scope and date combinations (GOV-03 constraints)", async () => {
    const m = await newMember("invalid");
    const roleId = await inA((tx) => createRole(tx, { name: `Invalid ${randomUUID().slice(0, 6)}`, permissions: [] }));
    await rejectsWithCode(
      inA((tx) => tx.query("INSERT INTO role_assignment (membership_id, role_id, scope_type, scope_legal_entity_id, effective_from, reason) VALUES ($1, $2, 'tenant', $3, '2026-07-01', 'x')", [m.membershipId, roleId, A.legalEntityId])),
      "CONSTRAINT_VIOLATION",
    );
    await rejectsWithCode(
      inA((tx) => assignRole(tx, { membershipId: m.membershipId, roleId, scope: { type: "tenant" }, effectiveFrom: "2026-07-02", effectiveTo: "2026-07-01", reason: "x" })),
      "CONSTRAINT_VIOLATION",
    );
  });

  it("recorded time and actor are set by the database, not the client", async () => {
    const m = await newMember("stamp");
    const roleId = await inA((tx) => createRole(tx, { name: `Stamp ${randomUUID().slice(0, 6)}`, permissions: [] }));
    await rejectsWithCode(
      inA((tx) => tx.query("INSERT INTO role_assignment (membership_id, role_id, scope_type, effective_from, reason, recorded_by) VALUES ($1, $2, 'tenant', '2026-07-01', 'x', 'forged')", [m.membershipId, roleId])),
      "PERMISSION_DENIED",
    );
    const ctx = admin();
    const id = await inA((tx) => assignRole(tx, { membershipId: m.membershipId, roleId, scope: { type: "tenant" }, effectiveFrom: "2026-07-01", reason: "x" }), ctx);
    const r = await inA((tx) => tx.query<{ recorded_by: string; recorded_at: Date }>("SELECT recorded_by, recorded_at FROM role_assignment WHERE id = $1", [id]));
    expect(r.rows[0]!.recorded_by).toBe(ctx.actor.id);
    expect(r.rows[0]!.recorded_at).toBeInstanceOf(Date);
  });

  it("writes require an actor in context", async () => {
    const client = await db.app.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [A.tenantId]);
      await rejectsWithCode(client.query("INSERT INTO legal_entity (legal_name_en) VALUES ('No actor')"), "PL006");
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("production payroll cannot be enabled on a legal entity (ORG-08 guard)", async () => {
    await rejectsWithCode(
      inA(async (tx) => {
        await tx.query("UPDATE legal_entity SET production_payroll_enabled = true, version = version + 1 WHERE id = $1", [A.legalEntityId]);
      }),
      "PERMISSION_DENIED",
    );
  });
});

describe("authorization (SEC-01 deny by default)", () => {
  async function grantedMember(permissions: string[], scope: { type: "tenant" } | { type: "legal_entity"; legalEntityId: string }, from = "2026-07-01", to?: string) {
    const m = await newMember("authz");
    const roleId = await inA((tx) => createRole(tx, { name: `Authz ${randomUUID().slice(0, 8)}`, permissions }));
    const assignmentId = await inA((tx) =>
      assignRole(tx, { membershipId: m.membershipId, roleId, scope, effectiveFrom: from, ...(to ? { effectiveTo: to } : {}), reason: "x" }),
    );
    await inA((tx) => changeMembershipStatus(tx, { membershipId: m.membershipId, expectedVersion: 1, status: "active", reason: "x" }));
    return { ...m, roleId, assignmentId };
  }
  const can = (userId: string, permission: string, asOf: string, legalEntityId?: string) =>
    inA((tx) => hasPermission(tx, { userId, permission, asOf, ...(legalEntityId ? { legalEntityId } : {}) }));

  it("denies every catalogue permission to a member with no grants, and to an unknown user", async () => {
    const codes = (await inA((tx) => tx.query<{ code: string }>("SELECT code FROM permission ORDER BY code"))).rows.map((r) => r.code);
    expect(codes.length).toBeGreaterThan(10);
    const m = await newMember("nothing");
    for (const code of codes) {
      expect(await can(m.userId, code, "2026-10-23", A.legalEntityId)).toBe(false);
      expect(await can(randomUUID(), code, "2026-10-23", A.legalEntityId)).toBe(false);
    }
  });

  it("grants exactly the role's permissions across the whole catalogue", async () => {
    const codes = (await inA((tx) => tx.query<{ code: string }>("SELECT code FROM permission ORDER BY code"))).rows.map((r) => r.code);
    const granted = codes.filter((_, i) => i % 2 === 0);
    const m = await grantedMember(granted, { type: "tenant" });
    for (const code of codes) expect([code, await can(m.userId, code, "2026-10-23", A.legalEntityId)]).toEqual([code, granted.includes(code)]);
  });

  it("legal-entity scope covers only that entity; tenant scope covers all", async () => {
    const other = await inA((tx) => createLegalEntity(tx, { legalNameEn: "Second Entity Ltd" }));
    const scoped = await grantedMember(["person:view"], { type: "legal_entity", legalEntityId: A.legalEntityId });
    expect(await can(scoped.userId, "person:view", "2026-10-23", A.legalEntityId)).toBe(true);
    expect(await can(scoped.userId, "person:view", "2026-10-23", other)).toBe(false);
    expect(await can(scoped.userId, "person:view", "2026-10-23")).toBe(false);
    const wide = await grantedMember(["person:view"], { type: "tenant" });
    expect(await can(wide.userId, "person:view", "2026-10-23", other)).toBe(true);
  });

  it("respects effective dates and membership status", async () => {
    const m = await grantedMember(["person:view"], { type: "tenant" }, "2026-08-01", "2026-08-31");
    expect(await can(m.userId, "person:view", "2026-07-31")).toBe(false);
    expect(await can(m.userId, "person:view", "2026-08-01")).toBe(true);
    expect(await can(m.userId, "person:view", "2026-08-31")).toBe(true);
    expect(await can(m.userId, "person:view", "2026-09-01")).toBe(false);
    await inA((tx) => changeMembershipStatus(tx, { membershipId: m.membershipId, expectedVersion: 2, status: "suspended", reason: "x" }));
    expect(await can(m.userId, "person:view", "2026-08-15")).toBe(false);
  });

  it("a grant in one tenant gives nothing in another", async () => {
    const m = await grantedMember(["person:view"], { type: "tenant" });
    const B = await seedTenant(db, "AuthzB");
    expect(await withTenant(db.app, userCtx(B.tenantId), (tx) => hasPermission(tx, { userId: m.userId, permission: "person:view", asOf: "2026-10-23" }))).toBe(false);
  });

  it("uses Asia/Dhaka business dates (NFR-11)", () => {
    expect(businessDateInDhaka(new Date("2026-10-23T17:59:59Z"))).toBe("2026-10-23");
    expect(businessDateInDhaka(new Date("2026-10-23T18:00:00Z"))).toBe("2026-10-24");
  });
});
