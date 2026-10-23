/**
 * Sign-in, MFA and sessions against the real database.
 * Requirements: IAM-01, IAM-02 (lockout, timeouts), IAM-04 (per-tenant sessions), IAM-05,
 * NFR-02, SEC-05 (MFA for privileged users), RBAC-17 (sessions end on suspension), AUD-01 (authentication events).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AuthService,
  changeMembershipStatus,
  createRole,
  assignRole,
  DataKey,
  inviteMember,
  issueAccessLink,
  totpCode,
  withTenant,
  type SessionInfo,
} from "../../src/index.js";
import { createDatabase, rejectsWithCode, seedTenant, userCtx, type SeededTenant, type TestDb } from "./support.js";

const PASSWORD = "monsoon lantern tea garden 7";
const meta = { correlationId: "test-auth", ipAddress: "192.0.2.20", userAgent: "vitest" };

let db: TestDb;
let A: SeededTenant;
let B: SeededTenant;
let clock = new Date("2026-10-24T04:00:00Z");
let auth: AuthService;

async function memberWithPassword(t: SeededTenant, email: string, opts: { privileged?: boolean } = {}): Promise<{ userId: string; membershipId: string }> {
  const m = await withTenant(db.app, userCtx(t.tenantId), async (tx) => {
    const created = await inviteMember(tx, email);
    await changeMembershipStatus(tx, { membershipId: created.membershipId, expectedVersion: 1, status: "active", reason: "test" });
    if (opts.privileged) {
      const roleId = await createRole(tx, { name: `Privileged ${email}`, permissions: ["role_assignment:create"] });
      await assignRole(tx, { membershipId: created.membershipId, roleId, scope: { type: "tenant" }, effectiveFrom: "2026-01-01", reason: "test" });
    }
    return created;
  });
  await auth.setPasswordForSeed(m.userId, PASSWORD);
  return m;
}

async function signIn(email: string, tenantId: string, code?: string): Promise<{ sessionToken: string; session: SessionInfo }> {
  const { challengeToken, mfaRequired } = await auth.login(email, PASSWORD, meta);
  if (mfaRequired) await auth.verifyMfa(challengeToken, { code: code! }, meta);
  return auth.selectTenant(challengeToken, tenantId, meta);
}

beforeAll(async () => {
  db = await createDatabase();
  auth = new AuthService({ authPool: db.auth, appPool: db.app, dataKey: DataKey.fromBase64(DataKey.generateBase64()), now: () => clock, settings: { scrypt: { N: 2 ** 12, r: 8, p: 1 } } });
  A = await seedTenant(db, "AuthA");
  B = await seedTenant(db, "AuthB");
});
afterAll(async () => db?.close());

const tick = (minutes: number) => {
  clock = new Date(clock.getTime() + minutes * 60_000);
};

describe("password sign-in", () => {
  it("creates a session bound to the chosen tenant and audits it there", async () => {
    const { userId } = await memberWithPassword(A, "plain@a.example.test");
    const { sessionToken, session } = await signIn("plain@a.example.test", A.tenantId);
    expect(session).toMatchObject({ userId, tenantId: A.tenantId, mfaVerified: false, mfaEnrollmentRequired: false });
    expect(await auth.resolveSession(sessionToken)).toMatchObject({ id: session.id });
    const audit = await withTenant(db.app, userCtx(A.tenantId), (tx) => tx.query("SELECT action FROM audit_event WHERE resource_id = $1", [session.id]));
    expect(audit.rows).toEqual([{ action: "session.created" }]);
    const stored = await db.admin.query("SELECT token_hash FROM auth_session WHERE id = $1", [session.id]);
    expect(stored.rows[0].token_hash).not.toBe(sessionToken);
  });

  it("gives one generic error for unknown email, wrong password and no password", async () => {
    await withTenant(db.app, userCtx(A.tenantId), (tx) => inviteMember(tx, "nopassword@a.example.test"));
    for (const [email, pw] of [["nobody@example.test", PASSWORD], ["plain@a.example.test", "wrong wrong wrong 1"], ["nopassword@a.example.test", PASSWORD]]) {
      await expect(auth.login(email!, pw!, meta)).rejects.toMatchObject({ code: "INVALID_CREDENTIALS", message: expect.stringContaining("Email or password is incorrect") });
    }
  });

  it("locks the account after 5 failures, even for the right password, until the lock expires", async () => {
    await memberWithPassword(A, "lock@a.example.test");
    for (let i = 0; i < 5; i++) await expect(auth.login("lock@a.example.test", "wrong guess number x", meta)).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    await expect(auth.login("lock@a.example.test", PASSWORD, meta)).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    tick(16);
    await expect(auth.login("lock@a.example.test", PASSWORD, meta)).resolves.toMatchObject({ mfaRequired: false });
    const events = await db.admin.query("SELECT event FROM auth_event e JOIN user_account u ON u.id = e.user_id WHERE u.email = 'lock@a.example.test' ORDER BY occurred_at, event");
    expect(events.rows.map((r) => r.event)).toContain("login.locked");
  });

  it("only offers tenants where the user is an active member (IAM-04)", async () => {
    const { userId } = await memberWithPassword(A, "both@example.test");
    await withTenant(db.app, userCtx(B.tenantId), (tx) => inviteMember(tx, "both@example.test"));
    const { challengeToken } = await auth.login("both@example.test", PASSWORD, meta);
    expect((await auth.challengeState(challengeToken)).tenants.map((t) => t.tenantId)).toEqual([A.tenantId]);
    await expect(auth.selectTenant(challengeToken, B.tenantId, meta)).rejects.toMatchObject({ code: "NOT_A_MEMBER" });
    const s = await auth.selectTenant(challengeToken, A.tenantId, meta);
    expect(s.session.userId).toBe(userId);
    await expect(auth.selectTenant(challengeToken, A.tenantId, meta)).rejects.toMatchObject({ code: "CHALLENGE_INVALID" });
  });

  it("expires sessions when idle and at the absolute limit", async () => {
    await memberWithPassword(A, "idle@a.example.test");
    const { sessionToken } = await signIn("idle@a.example.test", A.tenantId);
    tick(20);
    expect(await auth.resolveSession(sessionToken)).not.toBeNull();
    tick(20);
    expect(await auth.resolveSession(sessionToken)).not.toBeNull();
    tick(31);
    expect(await auth.resolveSession(sessionToken)).toBeNull();
    const second = await signIn("idle@a.example.test", A.tenantId);
    for (let i = 0; i < 12 * 4; i++) {
      tick(15);
      if (!(await auth.resolveSession(second.sessionToken))) break;
    }
    expect(await auth.resolveSession(second.sessionToken)).toBeNull();
  });

  it("ends the user's sessions in a tenant when their membership is suspended (RBAC-17)", async () => {
    const { membershipId } = await memberWithPassword(A, "suspend@a.example.test");
    const { sessionToken } = await signIn("suspend@a.example.test", A.tenantId);
    await withTenant(db.app, userCtx(A.tenantId), (tx) => changeMembershipStatus(tx, { membershipId, expectedVersion: 2, status: "suspended", reason: "test" }));
    expect(await auth.resolveSession(sessionToken)).toBeNull();
  });

  it("logout and revoke end the session", async () => {
    await memberWithPassword(A, "logout@a.example.test");
    const { sessionToken, session } = await signIn("logout@a.example.test", A.tenantId);
    await auth.logout(session, meta);
    expect(await auth.resolveSession(sessionToken)).toBeNull();
    expect((await auth.listSessions(session.userId)).find((s) => s.id === session.id)).toMatchObject({ active: false, revokedReason: "signed out" });
  });
});

describe("MFA (IAM-01, SEC-05)", () => {
  it("requires privileged users to enrol, then demands a fresh code at every sign-in", async () => {
    await memberWithPassword(A, "admin@a.example.test", { privileged: true });
    const first = await signIn("admin@a.example.test", A.tenantId);
    expect(first.session.mfaEnrollmentRequired).toBe(true);

    const { secret } = await auth.beginTotp(first.session);
    await expect(auth.confirmTotp(first.session, "000000", meta)).rejects.toMatchObject({ code: "MFA_INVALID" });
    const { recoveryCodes } = await auth.confirmTotp(first.session, totpCode(secret, clock), meta);
    expect(recoveryCodes).toHaveLength(10);
    expect(await auth.resolveSession(first.sessionToken)).toMatchObject({ mfaEnrollmentRequired: false, mfaVerified: true });
    const stored = await db.admin.query("SELECT secret_ciphertext FROM user_totp t JOIN user_account u ON u.id = t.user_id WHERE u.email = 'admin@a.example.test'");
    expect(stored.rows[0].secret_ciphertext).not.toContain(secret);

    tick(1);
    const { challengeToken, mfaRequired } = await auth.login("admin@a.example.test", PASSWORD, meta);
    expect(mfaRequired).toBe(true);
    expect((await auth.challengeState(challengeToken)).tenants).toEqual([]);
    await expect(auth.selectTenant(challengeToken, A.tenantId, meta)).rejects.toMatchObject({ code: "MFA_REQUIRED" });
    const code = totpCode(secret, clock);
    await auth.verifyMfa(challengeToken, { code }, meta);
    const s = await auth.selectTenant(challengeToken, A.tenantId, meta);
    expect(s.session).toMatchObject({ mfaVerified: true, mfaEnrollmentRequired: false });

    // The same code cannot be replayed on another login.
    const again = await auth.login("admin@a.example.test", PASSWORD, meta);
    await expect(auth.verifyMfa(again.challengeToken, { code }, meta)).rejects.toMatchObject({ code: "MFA_INVALID" });

    // Recovery codes work once.
    await auth.verifyMfa(again.challengeToken, { recoveryCode: recoveryCodes[0]!.toLowerCase() }, meta);
    const third = await auth.login("admin@a.example.test", PASSWORD, meta);
    await expect(auth.verifyMfa(third.challengeToken, { recoveryCode: recoveryCodes[0]! }, meta)).rejects.toMatchObject({ code: "MFA_INVALID" });
  });

  it("caps second-factor attempts per sign-in", async () => {
    const third = await auth.login("admin@a.example.test", PASSWORD, meta);
    for (let i = 0; i < 5; i++) await expect(auth.verifyMfa(third.challengeToken, { code: "000000" }, meta)).rejects.toMatchObject({ code: "MFA_INVALID" });
    await expect(auth.verifyMfa(third.challengeToken, { code: "000000" }, meta)).rejects.toMatchObject({ code: "CHALLENGE_INVALID" });
  });
});

describe("setup links and password changes", () => {
  it("lets an invited member set a password once, which accepts the invitation", async () => {
    const m = await withTenant(db.app, userCtx(A.tenantId), (tx) => inviteMember(tx, "invitee@a.example.test"));
    const link = await withTenant(db.app, userCtx(A.tenantId), (tx) => issueAccessLink(tx, m.membershipId));
    expect(link.purpose).toBe("initial-password");
    await expect(auth.setPasswordWithToken(link.token, "password1234", meta)).rejects.toMatchObject({ code: "PASSWORD_POLICY" });
    await auth.setPasswordWithToken(link.token, PASSWORD, meta);
    await expect(auth.setPasswordWithToken(link.token, PASSWORD, meta)).rejects.toMatchObject({ code: "TOKEN_INVALID" });
    const status = await withTenant(db.app, userCtx(A.tenantId), (tx) => tx.query("SELECT status FROM membership WHERE id = $1", [m.membershipId]));
    expect(status.rows[0]!.status).toBe("active");
    await expect(signIn("invitee@a.example.test", A.tenantId)).resolves.toBeTruthy();
  });

  it("expires links, keeps only the newest, and refuses self-issued links", async () => {
    const m = await withTenant(db.app, userCtx(A.tenantId), (tx) => inviteMember(tx, "expiry@a.example.test"));
    const old = await withTenant(db.app, userCtx(A.tenantId), (tx) => issueAccessLink(tx, m.membershipId));
    const fresh = await withTenant(db.app, userCtx(A.tenantId), (tx) => issueAccessLink(tx, m.membershipId, 1));
    await expect(auth.setPasswordWithToken(old.token, PASSWORD, meta)).rejects.toMatchObject({ code: "TOKEN_INVALID" });
    tick(61);
    await expect(auth.setPasswordWithToken(fresh.token, PASSWORD, meta)).rejects.toMatchObject({ code: "TOKEN_INVALID" });
    await rejectsWithCode(withTenant(db.app, userCtx(A.tenantId, m.userId), (tx) => issueAccessLink(tx, m.membershipId)), "SELF_APPROVAL_DENIED");
  });

  it("a reset link ends all existing sessions; a password change ends the others", async () => {
    const { membershipId } = await memberWithPassword(A, "reset@a.example.test");
    const s1 = await signIn("reset@a.example.test", A.tenantId);
    const link = await withTenant(db.app, userCtx(A.tenantId), (tx) => issueAccessLink(tx, membershipId));
    expect(link.purpose).toBe("password-reset");
    await auth.setPasswordWithToken(link.token, PASSWORD, meta);
    expect(await auth.resolveSession(s1.sessionToken)).toBeNull();

    const a = await signIn("reset@a.example.test", A.tenantId);
    const b = await signIn("reset@a.example.test", A.tenantId);
    await auth.changePassword(a.session, PASSWORD, "river boat jackfruit sky 9", meta);
    expect(await auth.resolveSession(a.sessionToken)).not.toBeNull();
    expect(await auth.resolveSession(b.sessionToken)).toBeNull();
    await expect(auth.changePassword(a.session, "wrong current pass", PASSWORD, meta)).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  });
});

describe("separation of roles", () => {
  it("the tenant data role cannot read authentication tables, and the auth role cannot read tenant data", async () => {
    for (const table of ["user_credential", "user_totp", "user_recovery_code", "auth_session", "auth_challenge", "auth_setup_token", "auth_event"]) {
      await rejectsWithCode(db.app.query(`SELECT * FROM ${table}`), "42501");
    }
    for (const table of ["person", "employment", "membership", "audit_event"]) {
      await rejectsWithCode(db.auth.query(`SELECT * FROM ${table}`), "42501");
    }
  });

  it("authentication events are append-only", async () => {
    await rejectsWithCode(db.auth.query("UPDATE auth_event SET reason = 'x'"), "42501");
    await rejectsWithCode(db.auth.query("DELETE FROM auth_event"), "42501");
    await rejectsWithCode(db.admin.query("DELETE FROM auth_event"), "PL005");
  });
});
