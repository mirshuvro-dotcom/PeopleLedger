import type pg from "pg";
import { mapDbError, TenantContextError } from "./errors.js";

export type ActorType = "user" | "service-account" | "system-job" | "support-staff" | "platform-operator";
export type RequestSource = "web" | "api" | "mobile" | "integration" | "job" | "platform";

export interface Actor {
  readonly type: ActorType;
  /** Stable actor reference recorded in audit and `*_by` columns, e.g. `user:<uuid>` or `job:outbox-worker-1`. */
  readonly id: string;
  /** Set when the actor is a signed-in user; used for self-approval checks. */
  readonly userId?: string;
}

/** Everything a tenant-scoped unit of work needs to identify itself (AUD-02). */
export interface RequestContext {
  readonly tenantId: string;
  readonly actor: Actor;
  readonly correlationId: string;
  readonly source: RequestSource;
  readonly requestId?: string;
  readonly actingAsUserId?: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
}

export interface PlatformContext {
  readonly actor: Actor & { readonly type: "platform-operator" };
  readonly correlationId: string;
}

export interface Tx {
  query<R extends pg.QueryResultRow = Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<pg.QueryResult<R>>;
}

export interface TenantTx extends Tx {
  readonly ctx: RequestContext;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/**
 * Run `fn` in one transaction bound to a tenant (ARCH-06). Context is set with
 * `set_config(..., true)`, the function form of SET LOCAL, so it is discarded
 * at COMMIT or ROLLBACK and can never leak to the next user of a pooled
 * connection. A connection that arrives carrying context (someone used a
 * session-level SET) is destroyed and the call fails closed.
 */
export async function withTenant<T>(pool: pg.Pool, ctx: RequestContext, fn: (tx: TenantTx) => Promise<T>): Promise<T> {
  if (!isUuid(ctx.tenantId)) throw new TenantContextError("tenantId must be a UUID.");
  if (ctx.actor.userId !== undefined && !isUuid(ctx.actor.userId)) throw new TenantContextError("actor.userId must be a UUID.");
  requireText(ctx.actor.id, "actor.id");
  requireText(ctx.correlationId, "correlationId");
  return inContext(
    pool,
    {
      "app.tenant_id": ctx.tenantId,
      "app.actor_id": ctx.actor.id,
      "app.actor_user_id": ctx.actor.userId ?? "",
      "app.correlation_id": ctx.correlationId,
    },
    (client) => fn({ ctx, query: (text, params) => client.query(text, params as unknown[]) }),
  );
}

/**
 * Platform path (RBAC-15): no tenant context at all. Use only with the
 * platform-role pool; tenant data tables are not granted to that role.
 */
export async function withPlatform<T>(pool: pg.Pool, ctx: PlatformContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  requireText(ctx.actor.id, "actor.id");
  requireText(ctx.correlationId, "correlationId");
  return inContext(
    pool,
    { "app.tenant_id": "", "app.actor_id": ctx.actor.id, "app.actor_user_id": "", "app.correlation_id": ctx.correlationId },
    (client) => fn({ query: (text, params) => client.query(text, params as unknown[]) }),
  );
}

async function inContext<T>(pool: pg.Pool, settings: Record<string, string>, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let discard: Error | undefined;
  try {
    const leftover = await client.query<{ t: string | null; a: string | null }>(
      "SELECT current_setting('app.tenant_id', true) AS t, current_setting('app.actor_id', true) AS a",
    );
    const row = leftover.rows[0];
    if (row?.t || row?.a) {
      discard = new TenantContextError("Pooled connection carried session-level context; connection discarded.");
      throw discard;
    }
    await client.query("BEGIN");
    const names = Object.keys(settings);
    await client.query(
      `SELECT ${names.map((_, i) => `set_config($${2 * i + 1}, $${2 * i + 2}, true)`).join(", ")}`,
      names.flatMap((n) => [n, settings[n]]),
    );
    try {
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        discard = rollbackError as Error;
      }
      throw mapDbError(error);
    }
  } finally {
    client.release(discard);
  }
}

function requireText(value: string, name: string): void {
  if (typeof value !== "string" || value.length === 0 || value.length > 200) {
    throw new TenantContextError(`${name} is required (1-200 characters).`);
  }
}
