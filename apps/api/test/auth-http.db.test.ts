/**
 * Sign-in over HTTP: cookies, CSRF, MFA enrolment gate, setup links, logout, rate limiting.
 * Requirements: IAM-01, IAM-02 (rate limits), IAM-04, IAM-05, NFR-02, SEC-05, RBAC-17.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { InjectOptions, LightMyRequestResponse } from "fastify";
import { assignRole, AuthService, changeMembershipStatus, createRole, DataKey, inviteMember, totpCode, withTenant } from "@peopleledger/platform";
import { createDatabase, seedTenant, userCtx, type SeededTenant, type TestDb } from "../../../packages/platform/test/db/support.js";
import { buildServer } from "../src/server.js";

const PASSWORD = "monsoon lantern tea garden 7";
const ORIGIN = "http://localhost:3000";
let db: TestDb;
let A: SeededTenant;
let api: ReturnType<typeof buildServer>;
let auth: AuthService;

beforeAll(async () => {
  db = await createDatabase();
  auth = new AuthService({ authPool: db.auth, appPool: db.app, dataKey: DataKey.fromBase64(DataKey.generateBase64()), settings: { scrypt: { N: 2 ** 12, r: 8, p: 1 } } });
  // Developer identity OFF: this suite exercises the production path only.
  api = buildServer({ config: { devAuth: false, environment: "test", webOrigin: ORIGIN, repoRoot: new URL("../../../", import.meta.url) }, appPool: db.app, auth, logger: false });
  A = await seedTenant(db, "Http");
});
afterAll(async () => {
  await api?.close();
  await db?.close();
});

/** A tiny cookie jar around fastify.inject. */
class Browser {
  private jar = new Map<string, string>();
  async req(opts: InjectOptions & { csrf?: boolean; origin?: string }): Promise<LightMyRequestResponse> {
    const headers: Record<string, string> = { ...(opts.headers as Record<string, string>) };
    if (this.jar.size) headers.cookie = [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
    if (opts.csrf !== false && opts.method === "POST") headers["x-pl-csrf"] = "1";
    if (opts.origin) headers.origin = opts.origin;
    const res = await api.inject({ ...opts, headers });
    const set = res.headers["set-cookie"];
    for (const c of Array.isArray(set) ? set : set ? [set] : []) {
      const [pair] = c.split(";");
      const [name, value] = pair!.split("=");
      if (/Max-Age=0/.test(c)) this.jar.delete(name!);
      else this.jar.set(name!, value!);
    }
    return res;
  }
  cookie(name: string) {
    return this.jar.get(name);
  }
}

async function member(email: string, privileged = false): Promise<{ userId: string; membershipId: string }> {
  const m = await withTenant(db.app, userCtx(A.tenantId), async (tx) => {
    const created = await inviteMember(tx, email);
    await changeMembershipStatus(tx, { membershipId: created.membershipId, expectedVersion: 1, status: "active", reason: "test" });
    const roleId = await createRole(tx, { name: `Role ${email}`, permissions: privileged ? ["person:view", "role_assignment:create"] : ["person:view"] });
    await assignRole(tx, { membershipId: created.membershipId, roleId, scope: { type: "tenant" }, effectiveFrom: "2026-01-01", reason: "test" });
    return created;
  });
  await auth.setPasswordForSeed(m.userId, PASSWORD);
  return m;
}

async function signIn(b: Browser, email: string): Promise<LightMyRequestResponse> {
  const login = await b.req({ method: "POST", url: "/auth/login", payload: { email, password: PASSWORD } });
  expect(login.statusCode).toBe(200);
  return b.req({ method: "POST", url: "/auth/tenant", payload: { tenantId: A.tenantId } });
}

describe("session cookies", () => {
  it("sign-in sets an HttpOnly, SameSite session cookie that authorizes tenant routes", async () => {
    await member("cookie@http.example.test");
    const b = new Browser();
    const res = await signIn(b, "cookie@http.example.test");
    expect(res.statusCode).toBe(200);
    const setCookie = String(res.headers["set-cookie"]);
    expect(setCookie).toMatch(/pl_session=[^;]+; Path=\/; HttpOnly; SameSite=Lax/);
    expect(res.json()).toMatchObject({ email: "cookie@http.example.test", tenantId: A.tenantId });
    expect((await b.req({ method: "GET", url: "/v1/people" })).statusCode).toBe(200);
    expect((await b.req({ method: "GET", url: "/auth/session" })).json().email).toBe("cookie@http.example.test");
  });

  it("refuses requests without a session when developer identity is off", async () => {
    const res = await api.inject({ method: "GET", url: "/v1/people", headers: { "x-dev-tenant-id": A.tenantId, "x-dev-user-id": A.userId } });
    expect(res.statusCode).toBe(401);
  });

  it("a forged or ended session cookie is rejected", async () => {
    expect((await api.inject({ method: "GET", url: "/v1/people", headers: { cookie: "pl_session=forged-token-value" } })).statusCode).toBe(401);
    await member("logout@http.example.test");
    const b = new Browser();
    await signIn(b, "logout@http.example.test");
    const token = b.cookie("pl_session")!;
    expect((await b.req({ method: "POST", url: "/auth/logout" })).statusCode).toBe(200);
    expect((await api.inject({ method: "GET", url: "/v1/people", headers: { cookie: `pl_session=${token}` } })).statusCode).toBe(401);
  });

  it("wrong password and unknown email get the same answer", async () => {
    const a = await api.inject({ method: "POST", url: "/auth/login", headers: { "x-pl-csrf": "1" }, payload: { email: "cookie@http.example.test", password: "not the password at all" } });
    const b = await api.inject({ method: "POST", url: "/auth/login", headers: { "x-pl-csrf": "1" }, payload: { email: "ghost@http.example.test", password: "not the password at all" } });
    expect([a.statusCode, b.statusCode]).toEqual([401, 401]);
    expect(a.json().error.message).toBe(b.json().error.message);
  });
});

describe("CSRF (NFR-02)", () => {
  it("state-changing requests need the protection header and a matching Origin", async () => {
    await member("csrf@http.example.test");
    const b = new Browser();
    await signIn(b, "csrf@http.example.test");
    const create = { method: "POST" as const, url: "/v1/people", payload: { legalNameEn: "CSRF probe", effectiveFrom: "2026-07-01" } };
    expect((await b.req({ ...create, csrf: false })).json().error.code).toBe("CSRF_REJECTED");
    expect((await b.req({ ...create, origin: "https://evil.example" })).json().error.code).toBe("CSRF_REJECTED");
    expect((await api.inject({ method: "POST", url: "/auth/login", payload: { email: "x@example.test", password: "y" } })).json().error.code).toBe("CSRF_REJECTED");
  });
});

describe("MFA enrolment gate (SEC-05)", () => {
  it("a privileged user without MFA can only enrol; afterwards everything opens", async () => {
    await member("priv@http.example.test", true);
    const b = new Browser();
    const res = await signIn(b, "priv@http.example.test");
    expect(res.json().mfaEnrollmentRequired).toBe(true);
    expect((await b.req({ method: "GET", url: "/v1/people" })).json().error.code).toBe("MFA_ENROLLMENT_REQUIRED");
    expect((await b.req({ method: "GET", url: "/v1/me" })).statusCode).toBe(200);
    const { secret } = (await b.req({ method: "POST", url: "/auth/mfa/totp/setup" })).json();
    const confirm = await b.req({ method: "POST", url: "/auth/mfa/totp/confirm", payload: { code: totpCode(secret, new Date()) } });
    expect(confirm.json().recoveryCodes).toHaveLength(10);
    expect((await b.req({ method: "GET", url: "/v1/people" })).statusCode).toBe(200);

    // Next sign-in requires the code before a tenant can be chosen.
    const b2 = new Browser();
    expect((await b2.req({ method: "POST", url: "/auth/login", payload: { email: "priv@http.example.test", password: PASSWORD } })).json()).toEqual({ mfaRequired: true });
    expect((await b2.req({ method: "POST", url: "/auth/tenant", payload: { tenantId: A.tenantId } })).json().error.code).toBe("MFA_REQUIRED");
    const recovery = confirm.json().recoveryCodes[0];
    expect((await b2.req({ method: "POST", url: "/auth/mfa", payload: { recoveryCode: recovery } })).json().tenants).toHaveLength(1);
    expect((await b2.req({ method: "POST", url: "/auth/tenant", payload: { tenantId: A.tenantId } })).statusCode).toBe(200);
  });
});

describe("setup links and sessions", () => {
  it("an administrator's access link lets an invited member set a password and sign in", async () => {
    const admin = await member("admin-links@http.example.test");
    await withTenant(db.app, userCtx(A.tenantId), async (tx) => {
      const roleId = await createRole(tx, { name: "Member admin", permissions: ["membership:create"] });
      const m = await tx.query<{ id: string }>("SELECT id FROM membership WHERE user_id = $1", [admin.userId]);
      await assignRole(tx, { membershipId: m.rows[0]!.id, roleId, scope: { type: "tenant" }, effectiveFrom: "2026-01-01", reason: "test" });
    });
    const invited = await withTenant(db.app, userCtx(A.tenantId), (tx) => inviteMember(tx, "newbie@http.example.test"));
    const b = new Browser();
    await signIn(b, "admin-links@http.example.test");
    const link = (await b.req({ method: "POST", url: `/v1/members/${invited.membershipId}/access-link` })).json();
    expect(link).toMatchObject({ purpose: "initial-password", path: expect.stringMatching(/^\/setup\?token=/) });
    const token = decodeURIComponent(link.path.split("token=")[1]);
    const anon = new Browser();
    const weak = await anon.req({ method: "POST", url: "/auth/setup", payload: { token, password: "password1234" } });
    expect(weak.statusCode).toBe(422);
    expect(weak.json().error.details).toContain("This password is too common.");
    expect((await anon.req({ method: "POST", url: "/auth/setup", payload: { token, password: PASSWORD } })).json()).toMatchObject({ ok: true, email: "newbie@http.example.test" });
    expect((await signIn(anon, "newbie@http.example.test")).statusCode).toBe(200);
  });

  it("lists sessions and revokes another one; suspension ends sessions (RBAC-17)", async () => {
    const m = await member("multi@http.example.test");
    const one = new Browser();
    const two = new Browser();
    await signIn(one, "multi@http.example.test");
    await signIn(two, "multi@http.example.test");
    const list = (await one.req({ method: "GET", url: "/auth/sessions" })).json();
    const other = list.items.find((s: { id: string; active: boolean }) => s.active && s.id !== list.currentSessionId);
    expect((await one.req({ method: "POST", url: `/auth/sessions/${other.id}/revoke` })).json()).toEqual({ revoked: true });
    expect((await two.req({ method: "GET", url: "/v1/people" })).statusCode).toBe(401);
    await withTenant(db.app, userCtx(A.tenantId), (tx) => changeMembershipStatus(tx, { membershipId: m.membershipId, expectedVersion: 2, status: "suspended", reason: "test" }));
    expect((await one.req({ method: "GET", url: "/v1/people" })).statusCode).toBe(401);
  });

  it("rate-limits repeated attempts on one account from one address, without blocking other accounts there", async () => {
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) {
      const r = await api.inject({ method: "POST", url: "/auth/login", headers: { "x-pl-csrf": "1" }, remoteAddress: "198.51.100.7", payload: { email: "nobody@example.test", password: "whatever whatever" } });
      codes.push(r.statusCode);
    }
    expect(codes.slice(0, 10).every((c) => c === 401)).toBe(true);
    expect(codes.slice(10)).toEqual([429, 429]);
    const colleague = await api.inject({ method: "POST", url: "/auth/login", headers: { "x-pl-csrf": "1" }, remoteAddress: "198.51.100.7", payload: { email: "colleague@example.test", password: "whatever whatever" } });
    expect(colleague.statusCode).toBe(401);
  });
});
