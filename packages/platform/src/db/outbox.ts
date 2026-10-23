import type pg from "pg";
import { withTenant, type TenantTx } from "./context.js";

/**
 * Transactional outbox and idempotent handlers (ARCH-07).
 *
 * - `publishEvent` writes the event in the business transaction, so an event
 *   exists if and only if the change committed. A repeated `dedupeKey` is ignored.
 * - Delivery is at least once. `processOutboxBatch` applies each handler's
 *   effect and its idempotency key in one tenant transaction, so a retry, a
 *   crash or a second worker can never apply the same effect twice.
 * - Handlers with external side effects (email, bank) must pass the event id to
 *   the provider as its idempotency key; the database cannot undo those.
 */

export interface PublishInput {
  readonly topic: string;
  readonly dedupeKey: string;
  /** Identifiers only. Do not put sensitive values in payloads. */
  readonly payload: Readonly<Record<string, unknown>>;
}

export async function publishEvent(tx: TenantTx, input: PublishInput): Promise<{ id: string | null; duplicate: boolean }> {
  const r = await tx.query<{ id: string }>(
    `INSERT INTO outbox_event (topic, dedupe_key, payload, correlation_id) VALUES ($1, $2, $3, $4)
     ON CONFLICT (tenant_id, topic, dedupe_key) DO NOTHING RETURNING id`,
    [input.topic, input.dedupeKey, JSON.stringify(input.payload), tx.ctx.correlationId],
  );
  return r.rowCount === 1 ? { id: r.rows[0]!.id, duplicate: false } : { id: null, duplicate: true };
}

/**
 * Apply `effect` at most once per (scope, key) within the tenant. The key row
 * is inserted first; a concurrent attempt blocks on the unique index until the
 * first commits (then skips) or rolls back (then proceeds).
 */
export async function runIdempotent(tx: TenantTx, scope: string, key: string, effect: () => Promise<void>): Promise<boolean> {
  const r = await tx.query(
    "INSERT INTO idempotency_key (scope, key) VALUES ($1, $2) ON CONFLICT (tenant_id, scope, key) DO NOTHING RETURNING key",
    [scope, key],
  );
  if (r.rowCount === 0) return false;
  await effect();
  return true;
}

export interface OutboxEvent {
  readonly tenantId: string;
  readonly id: string;
  readonly topic: string;
  readonly payload: Record<string, unknown>;
  readonly correlationId: string;
  readonly attempts: number;
}

export interface OutboxHandler {
  /** Stable name; part of the idempotency scope, so never rename a live handler. */
  readonly name: string;
  readonly topic: string;
  handle(tx: TenantTx, event: OutboxEvent): Promise<void>;
}

export interface WorkerOptions {
  readonly workerId: string;
  readonly handlers: readonly OutboxHandler[];
  readonly batchSize?: number;
  readonly leaseSeconds?: number;
  readonly maxAttempts?: number;
  readonly retryDelaySeconds?: number;
}

export interface BatchResult {
  readonly claimed: number;
  readonly done: number;
  readonly retried: number;
  readonly dead: number;
  readonly skipped: number;
}

interface Claimed {
  tenant_id: string;
  id: string;
  topic: string;
  attempts: number;
}

export async function claimOutboxEvents(workerPool: pg.Pool, workerId: string, limit: number, leaseSeconds: number): Promise<Claimed[]> {
  const r = await workerPool.query<Claimed>("SELECT tenant_id, id, topic, attempts FROM outbox_claim($1, $2, $3)", [workerId, limit, leaseSeconds]);
  return r.rows;
}

/** Claim one batch and process each event in its own tenant transaction. */
export async function processOutboxBatch(workerPool: pg.Pool, options: WorkerOptions): Promise<BatchResult> {
  const claimed = await claimOutboxEvents(workerPool, options.workerId, options.batchSize ?? 50, options.leaseSeconds ?? 60);
  const stats = { claimed: claimed.length, done: 0, retried: 0, dead: 0, skipped: 0 };
  for (const c of claimed) {
    const outcome = await processClaimedEvent(workerPool, c.tenant_id, c.id, options);
    stats[outcome] += 1;
  }
  return stats;
}

/**
 * Process one event. Exported so tests can drive two workers at the same event
 * without the claim step, proving idempotency does not rely on the lease.
 */
export async function processClaimedEvent(
  workerPool: pg.Pool,
  tenantId: string,
  eventId: string,
  options: WorkerOptions,
): Promise<"done" | "retried" | "dead" | "skipped"> {
  const ctx = {
    tenantId,
    actor: { type: "system-job" as const, id: `job:${options.workerId}` },
    correlationId: `outbox:${eventId}`,
    source: "job" as const,
  };
  try {
    return await withTenant(workerPool, ctx, async (tx) => {
      // Row lock: a second processor of the same event waits here, then sees `done`.
      const r = await tx.query<{ topic: string; payload: Record<string, unknown>; correlation_id: string; status: string; attempts: number }>(
        "SELECT topic, payload, correlation_id, status, attempts FROM outbox_event WHERE id = $1 FOR UPDATE",
        [eventId],
      );
      const row = r.rows[0];
      if (!row || row.status !== "processing") return "skipped";
      const event: OutboxEvent = { tenantId, id: eventId, topic: row.topic, payload: row.payload, correlationId: row.correlation_id, attempts: row.attempts };
      for (const handler of options.handlers.filter((h) => h.topic === row.topic)) {
        await runIdempotent(tx, `outbox:${handler.name}`, eventId, () => handler.handle(tx, event));
      }
      await tx.query(
        "UPDATE outbox_event SET status = 'done', processed_at = clock_timestamp(), locked_by = NULL, locked_until = NULL, last_error = NULL WHERE id = $1",
        [eventId],
      );
      return "done";
    });
  } catch (error) {
    return recordFailure(workerPool, ctx, eventId, error, options);
  }
}

async function recordFailure(
  workerPool: pg.Pool,
  ctx: Parameters<typeof withTenant>[1],
  eventId: string,
  error: unknown,
  options: WorkerOptions,
): Promise<"retried" | "dead" | "skipped"> {
  const message = (error instanceof Error ? `${error.name}: ${error.message}` : "unknown error").slice(0, 1000);
  // Only release our own lease: a worker whose lease expired must not reset an
  // event another worker has since re-claimed.
  return withTenant(workerPool, ctx, async (tx) => {
    const r = await tx.query<{ status: string }>(
      `UPDATE outbox_event
       SET status = CASE WHEN attempts >= $2 THEN 'dead' ELSE 'pending' END,
           available_at = clock_timestamp() + make_interval(secs => $3::double precision * attempts),
           locked_by = NULL, locked_until = NULL, last_error = $4
       WHERE id = $1 AND status = 'processing' AND locked_by = $5
       RETURNING status`,
      [eventId, options.maxAttempts ?? 5, options.retryDelaySeconds ?? 30, message, options.workerId],
    );
    const status = r.rows[0]?.status;
    return status === "dead" ? "dead" : status === "pending" ? "retried" : "skipped";
  });
}
