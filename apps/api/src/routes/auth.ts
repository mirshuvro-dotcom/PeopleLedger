import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AuthService, RequestMeta, SessionInfo } from "@peopleledger/platform";
import { unauthenticated } from "../errors.js";
import { assertCsrf, clearCookie, RateLimiter, readCookie, setCookie } from "../http.js";
import { SESSION_COOKIE } from "../tenant-route.js";
import { body, idParams, text, uuid } from "./schemas.js";

const CHALLENGE_COOKIE = "pl_challenge";

export interface AuthRouteDeps {
  readonly auth: AuthService;
  readonly webOrigin: string;
  readonly secureCookies: boolean;
}

/**
 * Sign-in, MFA, sessions and password endpoints (IAM-01, IAM-04, IAM-05, NFR-02).
 * Every POST requires the CSRF header, including login (prevents login CSRF).
 */
export function authRoutes(app: FastifyInstance, deps: AuthRouteDeps): void {
  // Strict per address+account (guessing one account), loose per address (shared office NAT is common).
  const attempts = new RateLimiter(10, 5 * 60_000);
  const perAddress = new RateLimiter(100, 5 * 60_000);
  const meta = (req: FastifyRequest): RequestMeta => {
    const ua = req.headers["user-agent"];
    return { correlationId: req.correlationId, ipAddress: req.ip, ...(typeof ua === "string" ? { userAgent: ua } : {}) };
  };
  const csrf = (req: FastifyRequest) => assertCsrf(req, deps.webOrigin);
  const challenge = (req: FastifyRequest): string => {
    const t = readCookie(req, CHALLENGE_COOKIE);
    if (!t) throw unauthenticated("Sign in again.");
    return t;
  };
  const session = async (req: FastifyRequest): Promise<SessionInfo> => {
    const s = await deps.auth.resolveSession(readCookie(req, SESSION_COOKIE));
    if (!s) throw unauthenticated();
    csrf(req);
    return s;
  };
  const view = (s: SessionInfo) => ({
    userId: s.userId,
    email: s.email,
    tenantId: s.tenantId,
    tenantName: s.tenantName,
    mfaVerified: s.mfaVerified,
    mfaEnrollmentRequired: s.mfaEnrollmentRequired,
    createdAt: s.createdAt,
    idleExpiresAt: s.idleExpiresAt,
    absoluteExpiresAt: s.absoluteExpiresAt,
  });
  const cookie = (reply: FastifyReply, name: string, value: string, maxAgeSeconds: number, sameSite: "Strict" | "Lax") =>
    setCookie(reply, name, value, { maxAgeSeconds, sameSite, secure: deps.secureCookies });

  app.post("/auth/login", { schema: { body: body(["email", "password"], { email: { type: "string", maxLength: 320 }, password: { type: "string", minLength: 1, maxLength: 1024 } }) } }, async (req, reply) => {
    csrf(req);
    const b = req.body as { email: string; password: string };
    perAddress.check(`login:${req.ip}`);
    attempts.check(`login:${req.ip}:${b.email.trim().toLowerCase()}`);
    const r = await deps.auth.login(b.email, b.password, meta(req));
    cookie(reply, CHALLENGE_COOKIE, r.challengeToken, 600, "Strict");
    return { mfaRequired: r.mfaRequired };
  });

  app.get("/auth/challenge", async (req) => deps.auth.challengeState(challenge(req)));

  app.post(
    "/auth/mfa",
    { schema: { body: { type: "object", additionalProperties: false, properties: { code: { type: "string", pattern: "^\\d{6}$" }, recoveryCode: { type: "string", minLength: 8, maxLength: 20 } } } } },
    async (req) => {
      csrf(req);
      perAddress.check(`mfa:${req.ip}`);
      const b = req.body as { code?: string; recoveryCode?: string };
      await deps.auth.verifyMfa(challenge(req), b, meta(req));
      return deps.auth.challengeState(challenge(req));
    },
  );

  app.post("/auth/tenant", { schema: { body: body(["tenantId"], { tenantId: uuid }) } }, async (req, reply) => {
    csrf(req);
    const r = await deps.auth.selectTenant(challenge(req), (req.body as { tenantId: string }).tenantId, meta(req));
    cookie(reply, SESSION_COOKIE, r.sessionToken, Math.floor((r.session.absoluteExpiresAt.getTime() - Date.now()) / 1000), "Lax");
    clearCookie(reply, CHALLENGE_COOKIE, deps.secureCookies);
    return view(r.session);
  });

  app.get("/auth/session", async (req) => {
    const s = await deps.auth.resolveSession(readCookie(req, SESSION_COOKIE));
    if (!s) throw unauthenticated("Not signed in.");
    return view(s);
  });

  app.post("/auth/logout", async (req, reply) => {
    const s = await session(req);
    await deps.auth.logout(s, meta(req));
    clearCookie(reply, SESSION_COOKIE, deps.secureCookies);
    return { ok: true };
  });

  app.get("/auth/sessions", async (req) => {
    const s = await session(req);
    return { currentSessionId: s.id, items: await deps.auth.listSessions(s.userId) };
  });

  app.post("/auth/sessions/:id/revoke", { schema: { params: idParams } }, async (req) => {
    const s = await session(req);
    return { revoked: await deps.auth.revokeSession(s.userId, (req.params as { id: string }).id, meta(req)) };
  });

  app.get("/auth/mfa", async (req) => {
    const s = await session(req);
    return { enabled: await deps.auth.mfaEnabled(s.userId), sessionVerified: s.mfaVerified, enrollmentRequired: s.mfaEnrollmentRequired };
  });

  app.post("/auth/mfa/totp/setup", async (req) => deps.auth.beginTotp(await session(req)));

  app.post("/auth/mfa/totp/confirm", { schema: { body: body(["code"], { code: { type: "string", pattern: "^\\d{6}$" } }) } }, async (req) => {
    const s = await session(req);
    return deps.auth.confirmTotp(s, (req.body as { code: string }).code, meta(req));
  });

  app.post("/auth/password", { schema: { body: body(["currentPassword", "newPassword"], { currentPassword: text(1024), newPassword: text(1024) }) } }, async (req) => {
    const s = await session(req);
    attempts.check(`password:${s.userId}`);
    const b = req.body as { currentPassword: string; newPassword: string };
    await deps.auth.changePassword(s, b.currentPassword, b.newPassword, meta(req));
    return { ok: true };
  });

  app.post("/auth/setup", { schema: { body: body(["token", "password"], { token: { type: "string", minLength: 20, maxLength: 200 }, password: text(1024) }) } }, async (req) => {
    csrf(req);
    perAddress.check(`setup:${req.ip}`);
    const b = req.body as { token: string; password: string };
    const r = await deps.auth.setPasswordWithToken(b.token, b.password, meta(req));
    return { ok: true, email: r.email };
  });
}
