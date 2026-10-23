import { randomInt, randomUUID } from "node:crypto";
import type pg from "pg";
import { writeAudit } from "../db/audit.js";
import { businessDateInDhaka } from "../db/authz.js";
import { withTenant, type RequestContext } from "../db/context.js";
import { changeMembershipStatus } from "../db/repositories.js";
import { DataKey, randomToken, sha256Hex } from "./crypto.js";
import { hashPassword, OWASP_SCRYPT, passwordPolicyIssues, verifyPassword, type ScryptParams } from "./password.js";
import { generateTotpSecret, otpauthUri, verifyTotp } from "./totp.js";

/**
 * Sign-in, MFA and sessions (IAM-01, IAM-02, IAM-04, IAM-05, NFR-02, SEC-05).
 *
 * Flow: password → challenge → (TOTP or recovery code when enrolled) → choose a
 * tenant where the user is an active member → session bound to that tenant.
 * Secrets never leave this service: tokens are stored as sha256, TOTP secrets
 * encrypted, passwords as scrypt hashes. Failures return one generic error so
 * accounts cannot be enumerated.
 */
export interface AuthSettings {
  readonly idleMinutes: number;
  readonly absoluteHours: number;
  readonly lockAfterFailures: number;
  readonly lockMinutes: number;
  readonly challengeMinutes: number;
  readonly maxChallengeAttempts: number;
  readonly setupLinkHours: number;
  readonly scrypt: ScryptParams;
}

/** Security defaults (OWASP session and authentication guidance); tenant policy (IAM-02) may tighten them later. */
export const DEFAULT_AUTH_SETTINGS: AuthSettings = {
  idleMinutes: 30,
  absoluteHours: 12,
  lockAfterFailures: 5,
  lockMinutes: 15,
  challengeMinutes: 10,
  maxChallengeAttempts: 5,
  setupLinkHours: 72,
  scrypt: OWASP_SCRYPT,
};

export interface RequestMeta {
  readonly correlationId: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
}

export type AuthErrorCode =
  | "INVALID_CREDENTIALS"
  | "CHALLENGE_INVALID"
  | "MFA_INVALID"
  | "MFA_REQUIRED"
  | "NOT_A_MEMBER"
  | "PASSWORD_POLICY"
  | "TOKEN_INVALID"
  | "MFA_ALREADY_ENABLED"
  | "MFA_NOT_PENDING";

export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    message: string,
    readonly details: readonly string[] = [],
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export interface SessionInfo {
  readonly id: string;
  readonly userId: string;
  readonly email: string;
  readonly tenantId: string;
  readonly tenantName: string;
  readonly mfaVerified: boolean;
  readonly mfaEnrollmentRequired: boolean;
  readonly createdAt: Date;
  readonly idleExpiresAt: Date;
  readonly absoluteExpiresAt: Date;
}

type AuthEvent =
  | "login.password_accepted" | "login.failed" | "login.locked" | "mfa.verified" | "mfa.failed" | "mfa.recovery_code_used"
  | "mfa.enrolled" | "session.created" | "session.revoked" | "password.set" | "password.changed" | "setup_link.used";

const GENERIC_LOGIN_FAILURE = "Email or password is incorrect, or the account is temporarily locked.";

export class AuthService {
  private readonly settings: AuthSettings;
  private readonly now: () => Date;
  private dummyHash: Promise<string> | undefined;

  constructor(
    private readonly deps: { authPool: pg.Pool; appPool: pg.Pool; dataKey: DataKey; now?: () => Date; settings?: Partial<AuthSettings> },
  ) {
    this.settings = { ...DEFAULT_AUTH_SETTINGS, ...deps.settings };
    this.now = deps.now ?? (() => new Date());
  }

  // ---- login -----------------------------------------------------------------

  async login(email: string, password: string, meta: RequestMeta): Promise<{ challengeToken: string; mfaRequired: boolean }> {
    const now = this.now();
    const acct = await this.deps.authPool.query<{ id: string; status: string; password_hash: string | null; locked_until: Date | null; totp: boolean }>(
      `SELECT u.id, u.status, c.password_hash, c.locked_until,
              EXISTS (SELECT 1 FROM user_totp t WHERE t.user_id = u.id AND t.confirmed_at IS NOT NULL) AS totp
       FROM user_account u LEFT JOIN user_credential c ON c.user_id = u.id
       WHERE u.email = lower(btrim($1))`,
      [email],
    );
    const a = acct.rows[0];
    if (!a || !a.password_hash || a.status !== "active") {
      // Same work as a real check, so response time does not reveal whether the account exists.
      await verifyPassword(password, await this.dummy());
      await this.event("login.failed", "failed", meta, { userId: a?.id ?? null, reason: a ? "no usable credential" : "unknown account" });
      throw new AuthError("INVALID_CREDENTIALS", GENERIC_LOGIN_FAILURE);
    }
    if (a.locked_until && a.locked_until > now) {
      await this.event("login.locked", "denied", meta, { userId: a.id, reason: "locked" });
      throw new AuthError("INVALID_CREDENTIALS", GENERIC_LOGIN_FAILURE);
    }
    if (!(await verifyPassword(password, a.password_hash))) {
      const r = await this.deps.authPool.query<{ failed_attempts: number }>(
        "UPDATE user_credential SET failed_attempts = failed_attempts + 1 WHERE user_id = $1 RETURNING failed_attempts",
        [a.id],
      );
      if ((r.rows[0]?.failed_attempts ?? 0) >= this.settings.lockAfterFailures) {
        await this.deps.authPool.query("UPDATE user_credential SET failed_attempts = 0, locked_until = $2 WHERE user_id = $1", [a.id, addMinutes(now, this.settings.lockMinutes)]);
        await this.event("login.locked", "denied", meta, { userId: a.id, reason: `${this.settings.lockAfterFailures} failed attempts` });
      } else {
        await this.event("login.failed", "failed", meta, { userId: a.id, reason: "wrong password" });
      }
      throw new AuthError("INVALID_CREDENTIALS", GENERIC_LOGIN_FAILURE);
    }
    await this.deps.authPool.query("UPDATE user_credential SET failed_attempts = 0, locked_until = NULL WHERE user_id = $1", [a.id]);
    const challengeToken = randomToken();
    await this.deps.authPool.query("INSERT INTO auth_challenge (token_hash, user_id, mfa_required, created_at, expires_at) VALUES ($1, $2, $3, $4, $5)", [
      sha256Hex(challengeToken),
      a.id,
      a.totp,
      now,
      addMinutes(now, this.settings.challengeMinutes),
    ]);
    await this.event("login.password_accepted", "success", meta, { userId: a.id });
    return { challengeToken, mfaRequired: a.totp };
  }

  /** Second factor: a TOTP code (never the same time step twice) or a single-use recovery code. */
  async verifyMfa(challengeToken: string, input: { code?: string; recoveryCode?: string }, meta: RequestMeta): Promise<void> {
    await this.authTx(async (c) => {
      const ch = await this.lockChallenge(c, challengeToken);
      if (!ch.mfa_required || ch.mfa_verified_at) return;
      if (ch.attempts >= this.settings.maxChallengeAttempts) throw new AuthError("CHALLENGE_INVALID", "Too many attempts. Sign in again.");
      let ok = false;
      if (input.code) {
        const t = await c.query<{ secret_ciphertext: string; last_used_step: string | null }>(
          "SELECT secret_ciphertext, last_used_step FROM user_totp WHERE user_id = $1 AND confirmed_at IS NOT NULL FOR UPDATE",
          [ch.user_id],
        );
        const row = t.rows[0];
        if (row) {
          const secret = this.deps.dataKey.decrypt(row.secret_ciphertext, `totp:${ch.user_id}`);
          const step = verifyTotp(secret, input.code.trim(), this.now(), row.last_used_step === null ? null : Number(row.last_used_step));
          if (step !== null) {
            await c.query("UPDATE user_totp SET last_used_step = $2 WHERE user_id = $1", [ch.user_id, step]);
            ok = true;
            await this.event("mfa.verified", "success", meta, { userId: ch.user_id }, c);
          }
        }
      } else if (input.recoveryCode) {
        const used = await c.query("UPDATE user_recovery_code SET used_at = $3 WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL", [
          ch.user_id,
          sha256Hex(normalizeRecoveryCode(input.recoveryCode)),
          this.now(),
        ]);
        if (used.rowCount === 1) {
          ok = true;
          await this.event("mfa.recovery_code_used", "success", meta, { userId: ch.user_id }, c);
        }
      }
      if (!ok) {
        await c.query("UPDATE auth_challenge SET attempts = attempts + 1 WHERE id = $1", [ch.id]);
        await this.event("mfa.failed", "failed", meta, { userId: ch.user_id }, c);
        return "failed";
      }
      await c.query("UPDATE auth_challenge SET mfa_verified_at = $2 WHERE id = $1", [ch.id, this.now()]);
      return "ok";
    }).then((outcome) => {
      if (outcome === "failed") throw new AuthError("MFA_INVALID", "That code is not valid. Check your authenticator app's time, or use a recovery code.");
    });
  }

  /** Where the login stands; tenants are listed only once every required factor is satisfied. */
  async challengeState(challengeToken: string): Promise<{ mfaRequired: boolean; mfaVerified: boolean; tenants: { tenantId: string; name: string }[] }> {
    const ch = await this.readChallenge(challengeToken);
    const mfaVerified = !ch.mfa_required || ch.mfa_verified_at !== null;
    return { mfaRequired: ch.mfa_required, mfaVerified, tenants: mfaVerified ? await this.activeTenants(ch.user_id) : [] };
  }

  async selectTenant(challengeToken: string, tenantId: string, meta: RequestMeta): Promise<{ sessionToken: string; session: SessionInfo }> {
    const ch = await this.readChallenge(challengeToken);
    if (ch.mfa_required && !ch.mfa_verified_at) throw new AuthError("MFA_REQUIRED", "Enter your authentication code first.");
    const tenant = (await this.activeTenants(ch.user_id)).find((t) => t.tenantId === tenantId);
    if (!tenant) throw new AuthError("NOT_A_MEMBER", "You are not an active member of that organisation.");
    const now = this.now();
    const privileged = await this.deps.authPool.query<{ p: boolean }>("SELECT auth_user_is_privileged($1, $2, $3::date) AS p", [ch.user_id, tenantId, businessDateInDhaka(now)]);
    const totp = await this.deps.authPool.query("SELECT 1 FROM user_totp WHERE user_id = $1 AND confirmed_at IS NOT NULL", [ch.user_id]);
    const mfaEnrollmentRequired = privileged.rows[0]?.p === true && totp.rowCount === 0;
    const sessionId = randomUUID();
    // Audit first: a session never exists without its tenant audit event (AUD-08).
    await this.tenantAudit(tenantId, ch.user_id, meta, "session.created", sessionId, { mfaVerified: ch.mfa_required, mfaEnrollmentRequired });
    const sessionToken = randomToken();
    await this.authTx(async (c) => {
      const consumed = await c.query("UPDATE auth_challenge SET consumed_at = $2 WHERE id = $1 AND consumed_at IS NULL", [ch.id, now]);
      if (consumed.rowCount !== 1) throw new AuthError("CHALLENGE_INVALID", "This sign-in was already used. Sign in again.");
      await c.query(
        `INSERT INTO auth_session (id, token_hash, user_id, tenant_id, mfa_verified, mfa_enrollment_required, created_at, last_seen_at, idle_expires_at, absolute_expires_at, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, $9, $10, $11)`,
        [
          sessionId,
          sha256Hex(sessionToken),
          ch.user_id,
          tenantId,
          ch.mfa_required,
          mfaEnrollmentRequired,
          now,
          addMinutes(now, this.settings.idleMinutes),
          addMinutes(now, this.settings.absoluteHours * 60),
          meta.ipAddress ?? null,
          meta.userAgent?.slice(0, 1000) ?? null,
        ],
      );
      await this.event("session.created", "success", meta, { userId: ch.user_id, tenantId, sessionId }, c);
    });
    const session = await this.resolveSession(sessionToken);
    return { sessionToken, session: session! };
  }

  // ---- sessions ----------------------------------------------------------------

  /** Valid session for a cookie token, or null. Slides the idle expiry, never past the absolute expiry. */
  async resolveSession(token: string | undefined): Promise<SessionInfo | null> {
    if (!token || token.length > 200) return null;
    const now = this.now();
    const r = await this.deps.authPool.query<{
      id: string; user_id: string; email: string; tenant_id: string; tenant_name: string; mfa_verified: boolean; mfa_enrollment_required: boolean;
      created_at: Date; last_seen_at: Date; idle_expires_at: Date; absolute_expires_at: Date;
    }>(
      `SELECT s.id, s.user_id, u.email, s.tenant_id, t.name AS tenant_name, s.mfa_verified, s.mfa_enrollment_required,
              s.created_at, s.last_seen_at, s.idle_expires_at, s.absolute_expires_at
       FROM auth_session s JOIN user_account u ON u.id = s.user_id JOIN tenant t ON t.id = s.tenant_id
       WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND u.status = 'active' AND t.status = 'active'`,
      [sha256Hex(token)],
    );
    const s = r.rows[0];
    if (!s || s.idle_expires_at <= now || s.absolute_expires_at <= now) return null;
    let idle = s.idle_expires_at;
    if (now.getTime() - s.last_seen_at.getTime() > 60_000) {
      idle = new Date(Math.min(addMinutes(now, this.settings.idleMinutes).getTime(), s.absolute_expires_at.getTime()));
      await this.deps.authPool.query("UPDATE auth_session SET last_seen_at = $2, idle_expires_at = $3 WHERE id = $1 AND revoked_at IS NULL", [s.id, now, idle]);
    }
    return {
      id: s.id,
      userId: s.user_id,
      email: s.email,
      tenantId: s.tenant_id,
      tenantName: s.tenant_name,
      mfaVerified: s.mfa_verified,
      mfaEnrollmentRequired: s.mfa_enrollment_required,
      createdAt: s.created_at,
      idleExpiresAt: idle,
      absoluteExpiresAt: s.absolute_expires_at,
    };
  }

  async logout(session: SessionInfo, meta: RequestMeta): Promise<void> {
    await this.revokeSession(session.userId, session.id, meta, "signed out");
  }

  /** IAM-05: the user's sessions across all their tenants. */
  async listSessions(userId: string): Promise<{ id: string; tenantName: string; createdAt: Date; lastSeenAt: Date; active: boolean; ipAddress: string | null; userAgent: string | null; revokedReason: string | null }[]> {
    const now = this.now();
    const r = await this.deps.authPool.query<{
      id: string; tenant_name: string; created_at: Date; last_seen_at: Date; revoked_at: Date | null; revoked_reason: string | null;
      idle_expires_at: Date; absolute_expires_at: Date; ip: string | null; user_agent: string | null;
    }>(
      `SELECT s.id, t.name AS tenant_name, s.created_at, s.last_seen_at, s.revoked_at, s.revoked_reason, s.idle_expires_at, s.absolute_expires_at,
              host(s.ip_address) AS ip, s.user_agent
       FROM auth_session s JOIN tenant t ON t.id = s.tenant_id WHERE s.user_id = $1 ORDER BY s.created_at DESC LIMIT 50`,
      [userId],
    );
    return r.rows.map((s) => ({
      id: s.id,
      tenantName: s.tenant_name,
      createdAt: s.created_at,
      lastSeenAt: s.last_seen_at,
      active: !s.revoked_at && s.idle_expires_at > now && s.absolute_expires_at > now,
      ipAddress: s.ip,
      userAgent: s.user_agent,
      revokedReason: s.revoked_reason,
    }));
  }

  async revokeSession(userId: string, sessionId: string, meta: RequestMeta, reason = "revoked by user"): Promise<boolean> {
    const r = await this.deps.authPool.query<{ tenant_id: string }>(
      "UPDATE auth_session SET revoked_at = $3, revoked_reason = $4 WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL RETURNING tenant_id",
      [sessionId, userId, this.now(), reason],
    );
    const tenantId = r.rows[0]?.tenant_id;
    if (!tenantId) return false;
    await this.event("session.revoked", "success", meta, { userId, tenantId, sessionId, reason });
    await this.tenantAudit(tenantId, userId, meta, "session.revoked", sessionId, { reason });
    return true;
  }

  // ---- MFA enrolment -----------------------------------------------------------

  async mfaEnabled(userId: string): Promise<boolean> {
    return (await this.deps.authPool.query("SELECT 1 FROM user_totp WHERE user_id = $1 AND confirmed_at IS NOT NULL", [userId])).rowCount === 1;
  }

  /** Start TOTP enrolment: a fresh secret, stored encrypted and inactive until confirmed with a code. */
  async beginTotp(session: SessionInfo): Promise<{ secret: string; otpauthUri: string }> {
    if (await this.mfaEnabled(session.userId)) throw new AuthError("MFA_ALREADY_ENABLED", "An authenticator app is already set up.");
    const secret = generateTotpSecret();
    await this.deps.authPool.query(
      `INSERT INTO user_totp (user_id, secret_ciphertext) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET secret_ciphertext = EXCLUDED.secret_ciphertext, last_used_step = NULL, created_at = clock_timestamp()
       WHERE user_totp.confirmed_at IS NULL`,
      [session.userId, this.deps.dataKey.encrypt(secret, `totp:${session.userId}`)],
    );
    return { secret, otpauthUri: otpauthUri(secret, session.email) };
  }

  /** Confirm enrolment with a code; returns 10 single-use recovery codes, shown once. */
  async confirmTotp(session: SessionInfo, code: string, meta: RequestMeta): Promise<{ recoveryCodes: string[] }> {
    const codes = Array.from({ length: 10 }, () => newRecoveryCode());
    await this.authTx(async (c) => {
      const t = await c.query<{ secret_ciphertext: string }>("SELECT secret_ciphertext FROM user_totp WHERE user_id = $1 AND confirmed_at IS NULL FOR UPDATE", [session.userId]);
      const row = t.rows[0];
      if (!row) throw new AuthError("MFA_NOT_PENDING", "Start the authenticator setup first.");
      const step = verifyTotp(this.deps.dataKey.decrypt(row.secret_ciphertext, `totp:${session.userId}`), code.trim(), this.now(), null);
      if (step === null) throw new AuthError("MFA_INVALID", "That code is not valid. Check the time on your phone and try the next code.");
      await c.query("UPDATE user_totp SET confirmed_at = $2, last_used_step = $3 WHERE user_id = $1", [session.userId, this.now(), step]);
      await c.query("DELETE FROM user_recovery_code WHERE user_id = $1", [session.userId]);
      for (const rc of codes) await c.query("INSERT INTO user_recovery_code (user_id, code_hash) VALUES ($1, $2)", [session.userId, sha256Hex(normalizeRecoveryCode(rc))]);
      // This session has now proved the second factor; lift the enrolment gate on all of the user's sessions.
      await c.query("UPDATE auth_session SET mfa_enrollment_required = false WHERE user_id = $1 AND revoked_at IS NULL", [session.userId]);
      await c.query("UPDATE auth_session SET mfa_verified = true WHERE id = $1", [session.id]);
      await this.event("mfa.enrolled", "success", meta, { userId: session.userId, tenantId: session.tenantId, sessionId: session.id }, c);
    });
    return { recoveryCodes: codes };
  }

  // ---- passwords -----------------------------------------------------------------

  async changePassword(session: SessionInfo, current: string, next: string, meta: RequestMeta): Promise<void> {
    const r = await this.deps.authPool.query<{ password_hash: string }>("SELECT password_hash FROM user_credential WHERE user_id = $1", [session.userId]);
    if (!r.rows[0] || !(await verifyPassword(current, r.rows[0].password_hash))) throw new AuthError("INVALID_CREDENTIALS", "The current password is incorrect.");
    const issues = passwordPolicyIssues(next, { email: session.email });
    if (issues.length) throw new AuthError("PASSWORD_POLICY", "The new password does not meet the policy.", issues);
    const hash = await hashPassword(next, this.settings.scrypt);
    await this.authTx(async (c) => {
      await c.query("UPDATE user_credential SET password_hash = $2, password_changed_at = $3 WHERE user_id = $1", [session.userId, hash, this.now()]);
      // Other sessions end; this one continues.
      await c.query("UPDATE auth_session SET revoked_at = $3, revoked_reason = 'password changed' WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL", [session.userId, session.id, this.now()]);
      await this.event("password.changed", "success", meta, { userId: session.userId, tenantId: session.tenantId, sessionId: session.id }, c);
    });
  }

  /**
   * Redeem a one-time setup link: set the password, end existing sessions, and
   * accept the invitation (invited → active) as the user themself.
   */
  async setPasswordWithToken(token: string, password: string, meta: RequestMeta): Promise<{ tenantId: string; email: string }> {
    const found = await this.deps.authPool.query<{ id: string; user_id: string; tenant_id: string; membership_id: string; email: string }>(
      `SELECT s.id, s.user_id, s.tenant_id, s.membership_id, u.email FROM auth_setup_token s JOIN user_account u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.used_at IS NULL AND s.expires_at > $2`,
      [sha256Hex(token), this.now()],
    );
    const t = found.rows[0];
    if (!t) throw new AuthError("TOKEN_INVALID", "This link is invalid, already used, or expired. Ask your administrator for a new one.");
    const issues = passwordPolicyIssues(password, { email: t.email });
    if (issues.length) throw new AuthError("PASSWORD_POLICY", "The password does not meet the policy.", issues);
    const hash = await hashPassword(password, this.settings.scrypt);
    await this.authTx(async (c) => {
      const used = await c.query("UPDATE auth_setup_token SET used_at = $2 WHERE id = $1 AND used_at IS NULL", [t.id, this.now()]);
      if (used.rowCount !== 1) throw new AuthError("TOKEN_INVALID", "This link was already used.");
      await this.upsertCredential(c, t.user_id, hash);
      await c.query("UPDATE auth_session SET revoked_at = $2, revoked_reason = 'password reset' WHERE user_id = $1 AND revoked_at IS NULL", [t.user_id, this.now()]);
      await this.event("setup_link.used", "success", meta, { userId: t.user_id, tenantId: t.tenant_id }, c);
      await this.event("password.set", "success", meta, { userId: t.user_id, tenantId: t.tenant_id }, c);
    });
    await withTenant(this.deps.appPool, this.userCtx(t.tenant_id, t.user_id, meta), async (tx) => {
      const m = await tx.query<{ status: string; version: number }>("SELECT status, version FROM membership WHERE id = $1", [t.membership_id]);
      if (m.rows[0]?.status === "invited") {
        await changeMembershipStatus(tx, { membershipId: t.membership_id, expectedVersion: m.rows[0].version, status: "active", reason: "Invitation accepted via setup link" });
      }
    });
    return { tenantId: t.tenant_id, email: t.email };
  }

  /** Development seeding only: set a password directly (policy still applies). */
  async setPasswordForSeed(userId: string, password: string): Promise<void> {
    const issues = passwordPolicyIssues(password);
    if (issues.length) throw new AuthError("PASSWORD_POLICY", issues.join(" "), issues);
    const hash = await hashPassword(password, this.settings.scrypt);
    await this.authTx((c) => this.upsertCredential(c, userId, hash));
  }

  // ---- helpers ---------------------------------------------------------------------

  private async upsertCredential(c: pg.PoolClient, userId: string, hash: string): Promise<void> {
    await c.query(
      `INSERT INTO user_credential (user_id, password_hash, password_changed_at) VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash, password_changed_at = EXCLUDED.password_changed_at, failed_attempts = 0, locked_until = NULL`,
      [userId, hash, this.now()],
    );
  }

  private dummy(): Promise<string> {
    this.dummyHash ??= hashPassword(randomToken(), this.settings.scrypt);
    return this.dummyHash;
  }

  private async activeTenants(userId: string): Promise<{ tenantId: string; name: string }[]> {
    const r = await this.deps.authPool.query<{ tenant_id: string; tenant_name: string; membership_status: string }>("SELECT * FROM auth_user_tenants($1)", [userId]);
    return r.rows.filter((t) => t.membership_status === "active").map((t) => ({ tenantId: t.tenant_id, name: t.tenant_name }));
  }

  private async readChallenge(token: string) {
    const r = await this.deps.authPool.query<{ id: string; user_id: string; mfa_required: boolean; mfa_verified_at: Date | null; attempts: number }>(
      "SELECT id, user_id, mfa_required, mfa_verified_at, attempts FROM auth_challenge WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > $2",
      [sha256Hex(token), this.now()],
    );
    if (!r.rows[0]) throw new AuthError("CHALLENGE_INVALID", "This sign-in has expired. Sign in again.");
    return r.rows[0];
  }

  private async lockChallenge(c: pg.PoolClient, token: string) {
    const r = await c.query<{ id: string; user_id: string; mfa_required: boolean; mfa_verified_at: Date | null; attempts: number }>(
      "SELECT id, user_id, mfa_required, mfa_verified_at, attempts FROM auth_challenge WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > $2 FOR UPDATE",
      [sha256Hex(token), this.now()],
    );
    if (!r.rows[0]) throw new AuthError("CHALLENGE_INVALID", "This sign-in has expired. Sign in again.");
    return r.rows[0];
  }

  private async authTx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
    const c = await this.deps.authPool.connect();
    try {
      await c.query("BEGIN");
      const result = await fn(c);
      await c.query("COMMIT");
      return result;
    } catch (error) {
      await c.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      c.release();
    }
  }

  private async event(
    event: AuthEvent,
    result: "success" | "failed" | "denied",
    meta: RequestMeta,
    f: { userId?: string | null; tenantId?: string; sessionId?: string; reason?: string },
    client?: pg.PoolClient,
  ): Promise<void> {
    await (client ?? this.deps.authPool).query(
      `INSERT INTO auth_event (occurred_at, event, result, user_id, tenant_id, session_id, reason, ip_address, user_agent, correlation_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [this.now(), event, result, f.userId ?? null, f.tenantId ?? null, f.sessionId ?? null, f.reason ?? null, meta.ipAddress ?? null, meta.userAgent?.slice(0, 1000) ?? null, meta.correlationId],
    );
  }

  private userCtx(tenantId: string, userId: string, meta: RequestMeta): RequestContext {
    return {
      tenantId,
      actor: { type: "user", id: `user:${userId}`, userId },
      correlationId: meta.correlationId,
      source: "web",
      ...(meta.ipAddress ? { ipAddress: meta.ipAddress } : {}),
      ...(meta.userAgent ? { userAgent: meta.userAgent } : {}),
    };
  }

  /** Tenant-visible security event in that tenant's hash-chained audit trail. */
  private async tenantAudit(tenantId: string, userId: string, meta: RequestMeta, action: string, sessionId: string, after: Record<string, unknown>): Promise<void> {
    await withTenant(this.deps.appPool, this.userCtx(tenantId, userId, meta), (tx) =>
      writeAudit(tx, { category: "security", action, resourceType: "auth_session", resourceId: sessionId, after }),
    );
  }
}

function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}

const RC_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** 10 characters in two groups, e.g. `K7QM2-XH4TB`; ~49 bits each, single use. */
function newRecoveryCode(): string {
  let s = "";
  while (s.length < 10) s += RC_ALPHABET[randomInt(RC_ALPHABET.length)];
  return `${s.slice(0, 5)}-${s.slice(5)}`;
}

export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
