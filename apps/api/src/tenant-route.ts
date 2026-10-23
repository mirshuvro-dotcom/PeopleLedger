import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest, FastifySchema } from "fastify";
import type pg from "pg";
import {
  AuthService,
  businessDateInDhaka,
  isUuid,
  requirePermission,
  withTenant,
  writeAudit,
  type RequestContext,
  type SessionInfo,
  type TenantTx,
} from "@peopleledger/platform";
import { ApiError, unauthenticated } from "./errors.js";
import { assertCsrf, readCookie } from "./http.js";

export const SESSION_COOKIE = "pl_session";

/**
 * Every tenant endpoint is declared through `tenantRoute`, which makes the
 * authorization decision part of the route definition (SEC-01, RBAC-16):
 *
 * - no route can be registered without a permission (or an explicit
 *   membership-only marker);
 * - the decision runs inside the same tenant transaction as the data access,
 *   with RLS as the second line of defence (ARCH-06);
 * - a refusal is itself audited (AUD-01) and returns 403 without revealing
 *   whether the target exists.
 */
export type RouteScope =
  /** Permission must be granted tenant-wide. */
  | { readonly kind: "tenant" }
  /** Permission must cover the legal entity named by the request. */
  | { readonly kind: "entity"; readonly legalEntityId: (req: FastifyRequest) => string | undefined }
  /** Any grant (tenant or some entity) admits the call; the handler must filter rows per entity. */
  | { readonly kind: "row-filtered" };

export interface RouteArgs {
  readonly tx: TenantTx;
  readonly req: FastifyRequest;
  readonly userId: string;
  /** Business date (Asia/Dhaka) used for effective-dated decisions. */
  readonly asOf: string;
}

export interface TenantRouteSpec {
  readonly method: "GET" | "POST";
  readonly url: string;
  readonly permission: string | { readonly membershipOnly: true };
  readonly scope?: RouteScope;
  readonly schema?: FastifySchema;
  readonly successStatus?: number;
  handler(args: RouteArgs): Promise<unknown>;
}

export interface RegisteredRoute {
  readonly method: string;
  readonly url: string;
  readonly permission: string | null;
  readonly scope: RouteScope["kind"] | "membership";
}

export interface RouteDeps {
  readonly appPool: pg.Pool;
  readonly auth: AuthService;
  readonly devAuth: boolean;
  readonly webOrigin: string;
  readonly routes: RegisteredRoute[];
}

class AuthorizationDenied extends ApiError {
  constructor(readonly permission: string) {
    super(403, "PERMISSION_DENIED", "You do not have permission for this action.");
  }
}

const CORRELATION = /^[A-Za-z0-9._-]{1,100}$/;

export function correlationIdOf(req: FastifyRequest): string {
  const header = req.headers["x-correlation-id"];
  return typeof header === "string" && CORRELATION.test(header) ? header : randomUUID();
}

export interface Caller {
  readonly ctx: RequestContext & { userId: string };
  /** Null when the caller used developer identity. */
  readonly session: SessionInfo | null;
}

/**
 * Who is calling: a signed-in session (cookie) or, only when developer
 * identity is enabled (never in production), the `x-dev-tenant-id` /
 * `x-dev-user-id` headers. A cookie always wins over headers.
 */
export async function resolveCaller(req: FastifyRequest, deps: Pick<RouteDeps, "auth" | "devAuth" | "webOrigin">): Promise<Caller> {
  const ua = req.headers["user-agent"];
  const base = {
    correlationId: req.correlationId,
    requestId: req.id,
    ipAddress: req.ip,
    ...(typeof ua === "string" ? { userAgent: ua.slice(0, 1000) } : {}),
  };
  const token = readCookie(req, SESSION_COOKIE);
  if (token) {
    const session = await deps.auth.resolveSession(token);
    if (!session) throw unauthenticated("Your session has ended. Sign in again.");
    assertCsrf(req, deps.webOrigin);
    return {
      session,
      ctx: { ...base, tenantId: session.tenantId, userId: session.userId, actor: { type: "user", id: `user:${session.userId}`, userId: session.userId }, source: "web" },
    };
  }
  if (!deps.devAuth) throw unauthenticated();
  const tenantId = req.headers["x-dev-tenant-id"];
  const userId = req.headers["x-dev-user-id"];
  if (!isUuid(tenantId) || !isUuid(userId)) throw unauthenticated("Sign in, or choose a developer identity (x-dev-tenant-id, x-dev-user-id).");
  return { session: null, ctx: { ...base, tenantId, userId, actor: { type: "user", id: `user:${userId}`, userId }, source: "api" } };
}

export function tenantRoute(app: FastifyInstance, deps: RouteDeps, spec: TenantRouteSpec): void {
  const membershipOnly = typeof spec.permission !== "string";
  const permission = typeof spec.permission === "string" ? spec.permission : null;
  if (!membershipOnly && !permission) throw new Error(`Route ${spec.method} ${spec.url} declares no permission.`);
  const scope: RouteScope = spec.scope ?? { kind: "tenant" };
  deps.routes.push({ method: spec.method, url: spec.url, permission, scope: membershipOnly ? "membership" : scope.kind });

  app.route({
    method: spec.method,
    url: spec.url,
    ...(spec.schema ? { schema: spec.schema } : {}),
    handler: async (req: FastifyRequest, reply: FastifyReply) => {
      const { ctx, session } = await resolveCaller(req, deps);
      // SEC-05: a privileged user without MFA may only see who they are until they enrol.
      if (session?.mfaEnrollmentRequired && !membershipOnly) {
        throw new ApiError(403, "MFA_ENROLLMENT_REQUIRED", "Set up an authenticator app before continuing (Account page).");
      }
      const asOf = businessDateInDhaka(new Date());
      try {
        const result = await withTenant(deps.appPool, ctx, async (tx) => {
          if (membershipOnly) {
            const m = await tx.query("SELECT 1 FROM membership WHERE user_id = $1 AND status = 'active'", [ctx.userId]);
            if (m.rowCount === 0) throw new AuthorizationDenied("membership");
          } else {
            await authorize(tx, ctx.userId, permission!, scope, req, asOf);
          }
          return spec.handler({ tx, req, userId: ctx.userId, asOf });
        });
        reply.code(spec.successStatus ?? 200);
        return result;
      } catch (error) {
        if (error instanceof AuthorizationDenied) await auditDenial(deps.appPool, ctx, spec, error.permission);
        throw error;
      }
    },
  });
}

async function authorize(tx: TenantTx, userId: string, permission: string, scope: RouteScope, req: FastifyRequest, asOf: string): Promise<void> {
  try {
    if (scope.kind === "tenant") {
      await requirePermission(tx, { userId, permission, asOf });
    } else if (scope.kind === "entity") {
      const legalEntityId = scope.legalEntityId(req);
      if (!isUuid(legalEntityId)) throw new ApiError(400, "VALIDATION_FAILED", "legalEntityId must be a UUID.");
      await requirePermission(tx, { userId, permission, legalEntityId, asOf });
    } else {
      const r = await tx.query<{ allowed: boolean }>(
        `SELECT app_has_permission($1, $2, NULL, $3::date)
             OR EXISTS (SELECT 1 FROM legal_entity le WHERE app_has_permission($1, $2, le.id, $3::date)) AS allowed`,
        [userId, permission, asOf],
      );
      if (!r.rows[0]?.allowed) throw new AuthorizationDenied(permission);
    }
  } catch (error) {
    if ((error as { code?: string }).code === "PERMISSION_DENIED" && !(error instanceof AuthorizationDenied)) {
      throw new AuthorizationDenied(permission);
    }
    throw error;
  }
}

/** AUD-01: refused requests are evidence too. Written in its own transaction because the request's rolled back. */
async function auditDenial(pool: pg.Pool, ctx: RequestContext, spec: TenantRouteSpec, permission: string): Promise<void> {
  try {
    await withTenant(pool, ctx, (tx) =>
      writeAudit(tx, {
        category: "security",
        action: "authorization.denied",
        resourceType: "api_route",
        resourceId: `${spec.method} ${spec.url}`.slice(0, 200),
        result: "denied",
        reason: `missing ${permission}`,
      }),
    );
  } catch {
    // A denial must still be returned even if recording it fails (e.g. tenant id of a tenant that does not exist).
  }
}
