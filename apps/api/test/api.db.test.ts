/**
 * HTTP API authorization and isolation, exercised through the real server.
 * Requirements: SEC-01 (deny by default), RBAC-16 (every endpoint checked
 * against the permission catalogue), ARCH-06 (tenant isolation through the
 * API), ARCH-09 (server-side validation, bounded pagination), AUD-01 (refused
 * requests audited), AUD-10 (activity log API).
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { InjectOptions } from "fastify";
import { assignRole, AuthService, changeMembershipStatus, createRole, DataKey, inviteMember, withTenant } from "@peopleledger/platform";
import { createEmployment, createPerson } from "@peopleledger/people";
import { createDatabase, seedTenant, userCtx, type SeededTenant, type TestDb } from "../../../packages/platform/test/db/support.js";
import { buildServer } from "../src/server.js";

type Server = ReturnType<typeof buildServer>;

let db: TestDb;
let api: Server;
let A: SeededTenant & { admin: string; nobody: string; viewer: string; servicesEntity: string; personId: string; roleId: string; assignmentId: string; memberId: string };
let B: SeededTenant & { admin: string; personId: string };
let allPermissions: string[];
let auth: AuthService;

async function member(t: SeededTenant, email: string, roles: { roleId: string; entity?: string }[]): Promise<string> {
  return withTenant(db.app, userCtx(t.tenantId), async (tx) => {
    const m = await inviteMember(tx, email);
    await changeMembershipStatus(tx, { membershipId: m.membershipId, expectedVersion: 1, status: "active", reason: "test" });
    for (const r of roles) {
      await assignRole(tx, { membershipId: m.membershipId, roleId: r.roleId, scope: r.entity ? { type: "legal_entity", legalEntityId: r.entity } : { type: "tenant" }, effectiveFrom: "2026-01-01", reason: "test" });
    }
    return m.userId;
  });
}

beforeAll(async () => {
  db = await createDatabase();
  allPermissions = (await db.admin.query<{ code: string }>("SELECT code FROM permission ORDER BY code")).rows.map((r) => r.code);
  auth = new AuthService({ authPool: db.auth, appPool: db.app, dataKey: DataKey.fromBase64(DataKey.generateBase64()), settings: { scrypt: { N: 2 ** 12, r: 8, p: 1 } } });
  api = buildServer({ config: { devAuth: true, environment: "test", webOrigin: "http://localhost:3000", repoRoot: new URL("../../../", import.meta.url) }, appPool: db.app, auth, logger: false });

  const a = await seedTenant(db, "ApiA");
  const seeded = await withTenant(db.app, userCtx(a.tenantId), async (tx) => {
    const adminRole = await createRole(tx, { name: "All", permissions: allPermissions });
    const emptyRole = await createRole(tx, { name: "Nothing", permissions: [] });
    const viewerRole = await createRole(tx, { name: "Employment viewer", permissions: ["employment:view", "employment:create"] });
    const services = await (await import("@peopleledger/platform")).createLegalEntity(tx, { legalNameEn: "Services Ltd" });
    const { personId } = await createPerson(tx, { legalNameEn: "Api Person A", effectiveFrom: "2026-07-01" });
    await createEmployment(tx, { personId, legalEntityId: a.legalEntityId, employeeCode: "A-1", hireDate: "2026-07-01", jobTitle: "Main entity job" });
    const { personId: p2 } = await createPerson(tx, { legalNameEn: "Api Person A2", effectiveFrom: "2026-07-01" });
    await createEmployment(tx, { personId: p2, legalEntityId: services, employeeCode: "S-1", hireDate: "2026-07-01", jobTitle: "Services job" });
    const assignmentId = await assignRole(tx, { membershipId: a.membershipId, roleId: emptyRole, scope: { type: "tenant" }, effectiveFrom: "2026-07-01", reason: "seed" });
    return { adminRole, emptyRole, viewerRole, services, personId, assignmentId };
  });
  A = {
    ...a,
    admin: await member(a, "admin@a.example.test", [{ roleId: seeded.adminRole }]),
    nobody: await member(a, "nobody@a.example.test", [{ roleId: seeded.emptyRole }]),
    viewer: await member(a, "viewer@a.example.test", [{ roleId: seeded.viewerRole, entity: seeded.services }]),
    servicesEntity: seeded.services,
    personId: seeded.personId,
    roleId: seeded.emptyRole,
    assignmentId: seeded.assignmentId,
    memberId: a.membershipId,
  };
  const b = await seedTenant(db, "ApiB");
  const bRole = await withTenant(db.app, userCtx(b.tenantId), (tx) => createRole(tx, { name: "All", permissions: allPermissions }));
  const bPerson = await withTenant(db.app, userCtx(b.tenantId), (tx) => createPerson(tx, { legalNameEn: "Api Person B", effectiveFrom: "2026-07-01" }));
  B = { ...b, admin: await member(b, "admin@b.example.test", [{ roleId: bRole }]), personId: bPerson.personId };
});
afterAll(async () => {
  await api?.close();
  await db?.close();
});

const as = (tenantId: string, userId: string) => ({ "x-dev-tenant-id": tenantId, "x-dev-user-id": userId });
const call = (opts: InjectOptions) => api.inject(opts);

/**
 * A valid request for every registered tenant route. Adding a route without an
 * entry here fails the suite, so the catalogue tests can't silently skip it.
 */
function sampleRequest(method: string, url: string): { url: string; payload?: unknown } {
  const unique = randomUUID().slice(0, 8);
  const samples: Record<string, { url: string; payload?: unknown }> = {
    "GET /v1/me": { url: "/v1/me" },
    "GET /v1/tenant": { url: "/v1/tenant" },
    "GET /v1/legal-entities": { url: "/v1/legal-entities" },
    "POST /v1/legal-entities": { url: "/v1/legal-entities", payload: { legalNameEn: `Entity ${unique}` } },
    "GET /v1/members": { url: "/v1/members" },
    "POST /v1/members": { url: "/v1/members", payload: { email: `new-${unique}@a.example.test` } },
    "POST /v1/members/:id/access-link": { url: `/v1/members/${A.memberId}/access-link` },
    "POST /v1/members/:id/status": { url: `/v1/members/${A.memberId}/status`, payload: { status: "suspended", expectedVersion: 999, reason: "probe" } },
    "GET /v1/permissions": { url: "/v1/permissions" },
    "GET /v1/roles": { url: "/v1/roles" },
    "POST /v1/roles": { url: "/v1/roles", payload: { name: `Role ${unique}`, permissions: ["person:view"] } },
    "GET /v1/role-assignments": { url: "/v1/role-assignments" },
    "POST /v1/role-assignments": {
      url: "/v1/role-assignments",
      payload: { membershipId: A.memberId, roleId: A.roleId, scope: { type: "legal_entity", legalEntityId: A.servicesEntity }, effectiveFrom: `2030-0${(Number.parseInt(unique, 16) % 9) + 1}-01`, effectiveTo: `2030-0${(Number.parseInt(unique, 16) % 9) + 1}-01`, reason: "probe" },
    },
    "POST /v1/role-assignments/:id/end": { url: `/v1/role-assignments/${A.assignmentId}/end`, payload: { expectedVersion: 999, effectiveTo: "2099-01-01", reason: "probe" } },
    "GET /v1/permission-check": { url: `/v1/permission-check?userId=${A.viewer}&permission=employment:view&legalEntityId=${A.servicesEntity}` },
    "GET /v1/people": { url: "/v1/people?limit=5" },
    "GET /v1/people/:id": { url: `/v1/people/${A.personId}` },
    "POST /v1/people": { url: "/v1/people", payload: { legalNameEn: `Person ${unique}`, effectiveFrom: "2026-07-01" } },
    "POST /v1/people/:id/versions": { url: `/v1/people/${A.personId}/versions`, payload: { legalNameEn: "Renamed", effectiveFrom: "2027-01-01", expectedVersion: 999 } },
    "GET /v1/employments": { url: "/v1/employments" },
    "POST /v1/employments": { url: "/v1/employments", payload: { personId: A.personId, legalEntityId: A.legalEntityId, employeeCode: `E-${unique}`, hireDate: "2026-07-01", jobTitle: "Probe" } },
    "GET /v1/audit-events": { url: "/v1/audit-events?limit=5" },
    "GET /v1/audit-events/verify": { url: "/v1/audit-events/verify" },
  };
  const s = samples[`${method} ${url}`];
  if (!s) throw new Error(`No sample request for ${method} ${url}; add one so authorization tests cover it.`);
  return s;
}

describe("every endpoint (RBAC-16)", () => {
  it("declares a permission from the catalogue (or membership-only)", () => {
    expect(api.tenantRoutes.length).toBeGreaterThanOrEqual(23);
    for (const r of api.tenantRoutes) {
      if (r.scope === "membership") expect(r.permission).toBeNull();
      else expect(allPermissions).toContain(r.permission);
    }
  });

  it("rejects calls without an identity (401)", async () => {
    for (const r of api.tenantRoutes) {
      const s = sampleRequest(r.method, r.url);
      const res = await call({ method: r.method as "GET", url: s.url, ...(s.payload ? { payload: s.payload as object } : {}) });
      expect([`${r.method} ${r.url}`, res.statusCode]).toEqual([`${r.method} ${r.url}`, 401]);
    }
  });

  it("denies a member with no permissions (403) and records each refusal", async () => {
    const before = Number((await db.admin.query("SELECT count(*) FROM audit_event WHERE action = 'authorization.denied'")).rows[0].count);
    let denied = 0;
    for (const r of api.tenantRoutes) {
      const s = sampleRequest(r.method, r.url);
      const res = await call({ method: r.method as "GET", url: s.url, headers: as(A.tenantId, A.nobody), ...(s.payload ? { payload: s.payload as object } : {}) });
      if (r.scope === "membership") {
        expect(res.statusCode).toBe(200);
        continue;
      }
      expect([`${r.method} ${r.url}`, res.statusCode, res.json().error.code]).toEqual([`${r.method} ${r.url}`, 403, "PERMISSION_DENIED"]);
      denied += 1;
    }
    const after = Number((await db.admin.query("SELECT count(*) FROM audit_event WHERE action = 'authorization.denied'")).rows[0].count);
    expect(after - before).toBe(denied);
  });

  it("serves every endpoint to a member holding all permissions", async () => {
    for (const r of api.tenantRoutes) {
      const s = sampleRequest(r.method, r.url);
      const res = await call({ method: r.method as "GET", url: s.url, headers: as(A.tenantId, A.admin), ...(s.payload ? { payload: s.payload as object } : {}) });
      // Probes with expectedVersion 999 must reach the domain and fail on the stale version, not on authorization.
      const expected = s.payload && (s.payload as { expectedVersion?: number }).expectedVersion === 999 ? [409] : [200, 201];
      expect([`${r.method} ${r.url}`, expected.includes(res.statusCode)]).toEqual([`${r.method} ${r.url}`, true]);
    }
  });

  it("each endpoint requires exactly its declared permission: holding every other permission is not enough", async () => {
    const needed = [...new Set(api.tenantRoutes.map((r) => r.permission).filter((p): p is string => p !== null))];
    for (const missing of needed) {
      const roleId = await withTenant(db.app, userCtx(A.tenantId), (tx) => createRole(tx, { name: `All but ${missing}`, permissions: allPermissions.filter((p) => p !== missing) }));
      const userId = await member(A, `allbut-${missing.replace(":", "-")}@a.example.test`, [{ roleId }]);
      for (const r of api.tenantRoutes.filter((x) => x.permission === missing)) {
        const s = sampleRequest(r.method, r.url);
        const res = await call({ method: r.method as "GET", url: s.url, headers: as(A.tenantId, userId), ...(s.payload ? { payload: s.payload as object } : {}) });
        expect([`${r.method} ${r.url} without ${missing}`, res.statusCode]).toEqual([`${r.method} ${r.url} without ${missing}`, 403]);
      }
    }
  });

  it("denies a user who is not a member of the tenant, even with full rights elsewhere", async () => {
    for (const r of api.tenantRoutes) {
      const s = sampleRequest(r.method, r.url);
      const res = await call({ method: r.method as "GET", url: s.url, headers: as(B.tenantId, A.admin), ...(s.payload ? { payload: s.payload as object } : {}) });
      expect([`${r.method} ${r.url}`, res.statusCode]).toEqual([`${r.method} ${r.url}`, 403]);
    }
  });
});

describe("tenant isolation through the API (ARCH-06)", () => {
  it("another tenant's record is simply not found", async () => {
    const res = await call({ method: "GET", url: `/v1/people/${B.personId}`, headers: as(A.tenantId, A.admin) });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
  });

  it("lists contain only the caller's tenant", async () => {
    const people = (await call({ method: "GET", url: "/v1/people?limit=100", headers: as(A.tenantId, A.admin) })).json().items as { id: string }[];
    expect(people.map((p) => p.id)).not.toContain(B.personId);
    const audit = (await call({ method: "GET", url: "/v1/audit-events?limit=100", headers: as(B.tenantId, B.admin) })).json().items as { resource_id: string }[];
    expect(audit.map((e) => e.resource_id)).not.toContain(A.personId);
  });

  it("cannot reference another tenant's person when creating an employment", async () => {
    const res = await call({
      method: "POST",
      url: "/v1/employments",
      headers: as(A.tenantId, A.admin),
      payload: { personId: B.personId, legalEntityId: A.legalEntityId, employeeCode: "X-B", hireDate: "2026-07-01", jobTitle: "x" },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("REFERENCE_NOT_FOUND");
  });
});

describe("entity-scoped grants", () => {
  it("filter list rows to the granted entity", async () => {
    const items = (await call({ method: "GET", url: "/v1/employments", headers: as(A.tenantId, A.viewer) })).json().items as { employee_code: string }[];
    expect(items.map((i) => i.employee_code)).toEqual(["S-1"]);
  });

  it("allow writes only inside the granted entity", async () => {
    const payload = { personId: A.personId, employeeCode: `V-${randomUUID().slice(0, 6)}`, hireDate: "2026-07-01", jobTitle: "x" };
    const outside = await call({ method: "POST", url: "/v1/employments", headers: as(A.tenantId, A.viewer), payload: { ...payload, legalEntityId: A.legalEntityId } });
    expect(outside.statusCode).toBe(403);
    const inside = await call({ method: "POST", url: "/v1/employments", headers: as(A.tenantId, A.viewer), payload: { ...payload, legalEntityId: A.servicesEntity } });
    expect(inside.statusCode).toBe(201);
  });

  it("are not enough for tenant-wide endpoints", async () => {
    expect((await call({ method: "GET", url: "/v1/people", headers: as(A.tenantId, A.viewer) })).statusCode).toBe(403);
  });
});

describe("input validation and responses (ARCH-09)", () => {
  it.each([
    ["unknown field", { method: "POST", url: "/v1/legal-entities", payload: { legalNameEn: "x", sneaky: true } }],
    ["bad uuid", { method: "GET", url: "/v1/people/not-a-uuid" }],
    ["page size above the bound", { method: "GET", url: "/v1/people?limit=1000" }],
    ["bad date", { method: "POST", url: "/v1/people", payload: { legalNameEn: "x", effectiveFrom: "23/10/2026" } }],
  ] as const)("rejects %s with 400", async (_name, req) => {
    const res = await call({ ...req, headers: as(A.tenantId, A.admin) } as InjectOptions);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_FAILED");
  });

  it("paginates with a cursor and a bounded page size", async () => {
    const first = (await call({ method: "GET", url: "/v1/people?limit=1", headers: as(A.tenantId, A.admin) })).json();
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).toBe(first.items[0].id);
    const second = (await call({ method: "GET", url: `/v1/people?limit=1&cursor=${first.nextCursor}`, headers: as(A.tenantId, A.admin) })).json();
    expect(second.items[0].id > first.items[0].id).toBe(true);
  });

  it("returns audit events newest first by numeric sequence", async () => {
    const items = (await call({ method: "GET", url: "/v1/audit-events?limit=100", headers: as(A.tenantId, A.admin) })).json().items as { seq: string }[];
    const seqs = items.map((i) => Number(i.seq));
    expect(seqs.length).toBeGreaterThan(10);
    expect(seqs).toEqual([...seqs].sort((x, y) => y - x));
  });

  it("echoes a safe correlation id and replaces an unsafe one", async () => {
    const ok = await call({ method: "GET", url: "/health", headers: { "x-correlation-id": "trace-123" } });
    expect(ok.headers["x-correlation-id"]).toBe("trace-123");
    const bad = await call({ method: "GET", url: "/health", headers: { "x-correlation-id": "<script>" } });
    expect(bad.headers["x-correlation-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("maps a stale version to 409", async () => {
    const res = await call({ method: "POST", url: `/v1/people/${A.personId}/versions`, headers: as(A.tenantId, A.admin), payload: { legalNameEn: "x", effectiveFrom: "2027-02-01", expectedVersion: 42 } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("STALE_VERSION");
  });
});

describe("developer identity switched off", () => {
  it("rejects tenant calls and does not expose developer endpoints", async () => {
    const prod = buildServer({ config: { devAuth: false, environment: "test", webOrigin: "http://localhost:3000", repoRoot: new URL("../../../", import.meta.url) }, appPool: db.app, auth, logger: false });
    try {
      expect((await prod.inject({ method: "GET", url: "/v1/people", headers: as(A.tenantId, A.admin) })).statusCode).toBe(401);
      expect((await prod.inject({ method: "GET", url: "/dev/identities" })).statusCode).toBe(404);
      expect((await prod.inject({ method: "POST", url: "/dev/payroll/preview", payload: { monthlyGross: "1" } })).statusCode).toBe(404);
    } finally {
      await prod.close();
    }
  });
});

describe("payroll preview (developer only)", () => {
  it("runs the engine in test mode and returns a bilingual payslip", async () => {
    const res = await call({ method: "POST", url: "/dev/payroll/preview", payload: { monthlyGross: "100000" } });
    const body = res.json();
    expect(body.result).toMatchObject({ status: "calculated", testOnly: true, amounts: { periodWithholding: "3750.00", netPay: "96250.00" } });
    expect(body.payslip.text.bn).toContain("শুধুমাত্র পরীক্ষামূলক");
  });

  it("returns blocking reasons instead of amounts for unsupported cases", async () => {
    const body = (await call({ method: "POST", url: "/dev/payroll/preview", payload: { monthlyGross: "100000", residency: "non-resident" } })).json();
    expect(body.result.status).toBe("blocked");
    expect(body.result.amounts).toBeNull();
    expect(body.result.blockingErrors[0].code).toBe("UNSUPPORTED_RESIDENCY");
  });
});
