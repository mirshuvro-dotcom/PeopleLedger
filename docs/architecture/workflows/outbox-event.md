# Workflow contract: outbox event (GOV-02, ARCH-07)

Enforced by: `outbox_event_transition()` trigger, check constraints, column grants, `outbox_claim()`
(db/migrations/0004). Tests: `packages/platform/test/db/outbox.db.test.ts`.

| Item | Contract |
|---|---|
| Actors | Producer: any tenant transaction (`publishEvent`). Consumer: `pl_worker` processes (`processOutboxBatch`) |
| Creation | Inserted in the business transaction; `(tenant_id, topic, dedupe_key)` unique, repeats ignored |
| Claim | `outbox_claim(worker, limit, lease)`: `FOR UPDATE SKIP LOCKED`; returns ids only; sets lease and `attempts + 1` |
| Processing | In the event's tenant context: lock row, run each handler under `runIdempotent('outbox:<handler>', event.id)`, mark `done`, all in one transaction |
| Checks | Allowed transition; content (topic, key, payload, correlation) immutable; lease can only be re-claimed after expiry |
| Timeouts | Lease expiry makes a `processing` event claimable again |
| Failure | Handler error → transaction rolled back (no effect) → `pending` with backoff, or `dead` after `maxAttempts`; only the lease holder may record failure |
| Cancellation | None; `dead` events need operator review (tooling not built) |
| External uncertainty | Handlers calling external systems must pass the event id as the provider idempotency key; the database cannot undo external effects |
| Audit events | None for delivery bookkeeping; handlers audit their own business effects |

## Transitions

`pending → processing → done | pending | dead`, and `processing → processing` only after lease expiry.
`done` and `dead` are terminal. Anything else raises `INVALID_TRANSITION` (PL003).
