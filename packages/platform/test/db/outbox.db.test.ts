/**
 * ARCH-07: transactional outbox with idempotent handlers. A retry, a crash, an
 * expired lease or a second worker never applies a handler's effect twice.
 *
 * Requirements: ARCH-07, GOV-02, AC-10.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  claimOutboxEvents,
  processClaimedEvent,
  processOutboxBatch,
  publishEvent,
  runIdempotent,
  withTenant,
  type OutboxHandler,
} from "../../src/index.js";
import { createDatabase, rejectsWithCode, seedTenant, userCtx, type SeededTenant, type TestDb } from "./support.js";

let db: TestDb;
let A: SeededTenant;
let B: SeededTenant;

beforeAll(async () => {
  db = await createDatabase();
  A = await seedTenant(db, "A");
  B = await seedTenant(db, "B");
  // Effect table deliberately has NO unique constraint: a duplicate effect would show up as a second row.
  await db.admin.query(`
    CREATE TABLE test_effect (
      tenant_id uuid NOT NULL DEFAULT app_current_tenant() REFERENCES tenant (id),
      event_id uuid NOT NULL,
      handler text NOT NULL
    );
    SELECT app_enable_tenant_rls('test_effect');
    GRANT SELECT, INSERT ON test_effect TO pl_app;`);
});
afterAll(async () => db?.close());
beforeEach(async () => {
  // Bypass the outbox triggers only to reset fixtures between tests.
  await db.admin.query("SET session_replication_role = replica; DELETE FROM outbox_event; DELETE FROM idempotency_key; DELETE FROM test_effect; SET session_replication_role = origin;");
});

const inTenant = <T>(t: SeededTenant, fn: Parameters<typeof withTenant<T>>[2]) => withTenant(db.app, userCtx(t.tenantId), fn);

function recorder(name = "recorder", behaviour: { failTimes?: number; failAfterEffect?: boolean; delayMs?: number } = {}): OutboxHandler & { calls: number } {
  let failures = 0;
  const h = {
    name,
    topic: "thing.happened",
    calls: 0,
    async handle(tx: Parameters<OutboxHandler["handle"]>[0], event: Parameters<OutboxHandler["handle"]>[1]) {
      h.calls += 1;
      if (behaviour.delayMs) await new Promise((r) => setTimeout(r, behaviour.delayMs));
      if (!behaviour.failAfterEffect && failures < (behaviour.failTimes ?? 0)) {
        failures += 1;
        throw new Error("synthetic handler failure");
      }
      await tx.query("INSERT INTO test_effect (event_id, handler) VALUES ($1, $2)", [event.id, name]);
      if (behaviour.failAfterEffect && failures < (behaviour.failTimes ?? 0)) {
        failures += 1;
        throw new Error("crash after effect, before commit");
      }
    },
  };
  return h;
}

async function publish(t: SeededTenant, key: string): Promise<string> {
  return inTenant(t, async (tx) => (await publishEvent(tx, { topic: "thing.happened", dedupeKey: key, payload: { key } })).id!);
}

async function effects(t: SeededTenant): Promise<{ event_id: string; handler: string }[]> {
  return (await inTenant(t, (tx) => tx.query<{ event_id: string; handler: string }>("SELECT event_id, handler FROM test_effect ORDER BY event_id"))).rows;
}

async function status(t: SeededTenant, id: string) {
  return (await inTenant(t, (tx) => tx.query<{ status: string; attempts: number; last_error: string | null }>("SELECT status, attempts, last_error FROM outbox_event WHERE id = $1", [id]))).rows[0];
}

describe("publishing", () => {
  it("an event exists only if the business transaction committed", async () => {
    await expect(
      inTenant(A, async (tx) => {
        await publishEvent(tx, { topic: "thing.happened", dedupeKey: "rolled-back", payload: {} });
        throw new Error("business failure");
      }),
    ).rejects.toThrow("business failure");
    expect((await inTenant(A, (tx) => tx.query("SELECT 1 FROM outbox_event"))).rowCount).toBe(0);
  });

  it("a repeated dedupe key is ignored, so a retried request publishes once", async () => {
    const first = await inTenant(A, (tx) => publishEvent(tx, { topic: "thing.happened", dedupeKey: "k1", payload: {} }));
    const again = await inTenant(A, (tx) => publishEvent(tx, { topic: "thing.happened", dedupeKey: "k1", payload: {} }));
    expect(first.duplicate).toBe(false);
    expect(again).toEqual({ id: null, duplicate: true });
    expect((await inTenant(A, (tx) => tx.query("SELECT 1 FROM outbox_event"))).rowCount).toBe(1);
  });

  it("the same dedupe key in another tenant is a different event", async () => {
    await publish(A, "shared");
    await publish(B, "shared");
    expect((await db.admin.query("SELECT 1 FROM outbox_event")).rowCount).toBe(2);
  });
});

describe("processing", () => {
  it("applies each handler once and marks the event done", async () => {
    const id = await publish(A, "e1");
    const h = recorder();
    expect(await processOutboxBatch(db.worker, { workerId: "w1", handlers: [h] })).toMatchObject({ claimed: 1, done: 1 });
    expect(await processOutboxBatch(db.worker, { workerId: "w1", handlers: [h] })).toMatchObject({ claimed: 0 });
    expect(await effects(A)).toEqual([{ event_id: id, handler: "recorder" }]);
    expect(await status(A, id)).toMatchObject({ status: "done", attempts: 1 });
  });

  it("a failing handler leaves no effect and the event is retried", async () => {
    const id = await publish(A, "e2");
    const h = recorder("flaky", { failTimes: 1 });
    expect(await processOutboxBatch(db.worker, { workerId: "w1", handlers: [h], retryDelaySeconds: 0 })).toMatchObject({ retried: 1 });
    expect(await effects(A)).toEqual([]);
    expect(await status(A, id)).toMatchObject({ status: "pending", attempts: 1, last_error: "Error: synthetic handler failure" });
    expect(await processOutboxBatch(db.worker, { workerId: "w1", handlers: [h], retryDelaySeconds: 0 })).toMatchObject({ done: 1 });
    expect(await effects(A)).toHaveLength(1);
  });

  it("a crash after the effect but before commit rolls the effect back, so the retry applies it exactly once", async () => {
    await publish(A, "e3");
    const h = recorder("crashy", { failTimes: 1, failAfterEffect: true });
    await processOutboxBatch(db.worker, { workerId: "w1", handlers: [h], retryDelaySeconds: 0 });
    expect(await effects(A)).toEqual([]);
    await processOutboxBatch(db.worker, { workerId: "w1", handlers: [h], retryDelaySeconds: 0 });
    expect(h.calls).toBe(2);
    expect(await effects(A)).toHaveLength(1);
  });

  it("an event that keeps failing goes dead after maxAttempts", async () => {
    const id = await publish(A, "e4");
    const h = recorder("broken", { failTimes: 99 });
    for (let i = 0; i < 3; i++) await processOutboxBatch(db.worker, { workerId: "w1", handlers: [h], retryDelaySeconds: 0, maxAttempts: 3 });
    expect(await status(A, id)).toMatchObject({ status: "dead", attempts: 3 });
    expect(await processOutboxBatch(db.worker, { workerId: "w1", handlers: [h] })).toMatchObject({ claimed: 0 });
  });

  it("each handler on a topic is idempotent independently", async () => {
    const id = await publish(A, "e5");
    await processOutboxBatch(db.worker, { workerId: "w1", handlers: [recorder("one"), recorder("two")] });
    expect((await effects(A)).map((e) => e.handler).sort()).toEqual(["one", "two"]);
    expect((await effects(A)).every((e) => e.event_id === id)).toBe(true);
  });
});

describe("leases and concurrency", () => {
  it("a leased event cannot be claimed again until the lease expires; the late worker then does nothing", async () => {
    const id = await publish(A, "lease");
    const first = await claimOutboxEvents(db.worker, "crashed-worker", 10, 1);
    expect(first.map((c) => c.id)).toEqual([id]);
    expect(await claimOutboxEvents(db.worker, "w2", 10, 30)).toEqual([]);
    await new Promise((r) => setTimeout(r, 1200));
    const h = recorder();
    expect(await processOutboxBatch(db.worker, { workerId: "w2", handlers: [h] })).toMatchObject({ claimed: 1, done: 1 });
    // The "crashed" worker wakes up and tries to finish its stale claim.
    expect(await processClaimedEvent(db.worker, A.tenantId, id, { workerId: "crashed-worker", handlers: [h] })).toBe("skipped");
    expect(await effects(A)).toHaveLength(1);
    expect(await status(A, id)).toMatchObject({ status: "done", attempts: 2 });
  });

  it("a stale worker's failure cannot release a lease another worker now holds", async () => {
    const id = await publish(A, "stale-fail");
    await claimOutboxEvents(db.worker, "old", 10, 1);
    await new Promise((r) => setTimeout(r, 1200));
    expect((await claimOutboxEvents(db.worker, "new", 10, 60)).map((c) => c.id)).toEqual([id]);
    const failing = recorder("bad", { failTimes: 9 });
    expect(await processClaimedEvent(db.worker, A.tenantId, id, { workerId: "old", handlers: [failing] })).toBe("skipped");
    expect(await status(A, id)).toMatchObject({ status: "processing", attempts: 2 });
    expect(await processClaimedEvent(db.worker, A.tenantId, id, { workerId: "new", handlers: [recorder()] })).toBe("done");
    expect(await effects(A)).toHaveLength(1);
  });

  it("two processors racing on the same event produce one effect", async () => {
    const id = await publish(A, "race");
    await claimOutboxEvents(db.worker, "w1", 10, 30);
    const h = recorder("slow", { delayMs: 100 });
    const outcomes = await Promise.all([
      processClaimedEvent(db.worker, A.tenantId, id, { workerId: "w1", handlers: [h] }),
      processClaimedEvent(db.worker, A.tenantId, id, { workerId: "w2", handlers: [h] }),
    ]);
    expect(outcomes.sort()).toEqual(["done", "skipped"]);
    expect(await effects(A)).toHaveLength(1);
  });

  it("four concurrent workers over 40 events in two tenants apply every effect exactly once", async () => {
    const ids = [];
    for (let i = 0; i < 20; i++) ids.push(await publish(A, `bulk-${i}`), await publish(B, `bulk-${i}`));
    const h = recorder("bulk", { delayMs: 5 });
    const worker = async (n: number) => {
      let total = 0;
      for (;;) {
        const r = await processOutboxBatch(db.worker, { workerId: `w${n}`, handlers: [h], batchSize: 3 });
        if (r.claimed === 0) return total;
        total += r.done;
      }
    };
    const done = await Promise.all([1, 2, 3, 4].map(worker));
    expect(done.reduce((a, b) => a + b, 0)).toBe(40);
    const all = [...(await effects(A)), ...(await effects(B))];
    expect(all).toHaveLength(40);
    expect(new Set(all.map((e) => e.event_id)).size).toBe(40);
    expect((await db.admin.query("SELECT 1 FROM outbox_event WHERE status <> 'done'")).rowCount).toBe(0);
  });

  it("runIdempotent: concurrent attempts apply once; a rolled-back attempt does not consume the key", async () => {
    const attempt = (fail: boolean) =>
      inTenant(A, async (tx) => {
        const ran = await runIdempotent(tx, "test:payment-like", "same-key", async () => {
          await tx.query("INSERT INTO test_effect (event_id, handler) VALUES (gen_random_uuid(), 'direct')");
          await new Promise((r) => setTimeout(r, 50));
        });
        if (fail) throw new Error("abort after effect");
        return ran;
      });
    await expect(attempt(true)).rejects.toThrow("abort after effect");
    expect(await effects(A)).toEqual([]);
    const results = await Promise.all([attempt(false), attempt(false), attempt(false)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await effects(A)).toHaveLength(1);
  });
});

describe("state contract (GOV-02)", () => {
  it("rejects transitions outside the contract", async () => {
    const id = await publish(A, "contract");
    await processOutboxBatch(db.worker, { workerId: "w1", handlers: [recorder()] });
    await rejectsWithCode(
      withTenant(db.worker, userCtx(A.tenantId), (tx) => tx.query("UPDATE outbox_event SET status = 'pending', processed_at = NULL WHERE id = $1", [id])),
      "INVALID_TRANSITION",
    );
  });

  it("event content is immutable and status is writable only by workers", async () => {
    const id = await publish(A, "immutable");
    await rejectsWithCode(withTenant(db.worker, userCtx(A.tenantId), (tx) => tx.query("UPDATE outbox_event SET payload = '{}' WHERE id = $1", [id])), "PERMISSION_DENIED");
    await rejectsWithCode(inTenant(A, (tx) => tx.query("UPDATE outbox_event SET status = 'dead' WHERE id = $1", [id])), "PERMISSION_DENIED");
  });

  it("an unexpired lease cannot be stolen by a direct update", async () => {
    const id = await publish(A, "steal");
    await claimOutboxEvents(db.worker, "w1", 10, 60);
    await rejectsWithCode(
      withTenant(db.worker, userCtx(A.tenantId), (tx) => tx.query("UPDATE outbox_event SET locked_by = 'thief', attempts = attempts + 1 WHERE id = $1", [id])),
      "INVALID_TRANSITION",
    );
  });
});
