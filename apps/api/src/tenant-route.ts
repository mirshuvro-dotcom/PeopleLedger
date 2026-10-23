import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest, FastifySchema } from "fastify";
import type pg from "pg";
import {
  businessDateInDhaka,
  isUuid,
  requirePermission,
  withTenant,
  writeAudit,
  type RequestContext,
  type TenantTx,
} from "@peopleledger/platform";
import { ApiError, unauthenticated } from "./errors.js";

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
  readonly devAuth: boolean;
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

/**
 * Developer identity (stand-in for IAM-01 sign-in): `x-dev-tenant-id` and
 * `x-dev-user-id` headers. Only honoured when dev auth is enabled, which the
 * config refuses in production. Membership is verified by the permission check.
 */
export function requestContext(req: FastifyRequest, devAuth: boolean): RequestContext & { userId: string } {
  if (!devAuth) throw unauthenticated("Sign-in is not available yet (IAM-01); this server has developer identity disabled.");
  const tenantId = req.headers["x-dev-tenant-id"];
  const userId = req.headers["x-dev-user-id"];
  if (!isUuid(tenantId) || !isUuid(userId)) throw unauthenticated("Choose a tenant and user (x-dev-tenant-id, x-dev-user-id).");
  const ua = req.headers["user-agent"];
  return {
    tenantId,
    userId,
    actor: { type: "user", id: `user:${userId}`, userId },
    correlationId: (req as FastifyRequest & { correlationId: string }).correlationId,
    source: "api",
    requestId: req.id,
    ipAddress: req.ip,
    ...(typeof ua === "string" ? { userAgent: ua.slice(0, 1000) } : {}),
  };
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
      const ctx = requestContext(req, deps.devAuth);
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
