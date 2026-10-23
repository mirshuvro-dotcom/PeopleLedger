# ADR-0003: PostgreSQL tenancy, audit chain, outbox and migrations

- Status: Accepted for the data layer; hosting, backup and key management remain Phase 0 decisions
- Requirements: ARCH-04 – ARCH-07, SEC-01, NFR-01, NFR-03, AUD-01 – AUD-09, RBAC-15, RBAC-16, GOV-02, GOV-03

## Decisions

**Roles.** Cluster roles `pl_app` (requests), `pl_worker` (member of `pl_app` + outbox claim) and `pl_platform`
(tenant provisioning) are created by `db/roles.sql`, not migrations, because roles are cluster-wide. None owns
tables or has BYPASSRLS. A separate schema-owner role runs migrations and is never used at runtime. Owner-run
`SECURITY DEFINER` functions are the only cross-tenant paths (`provision_tenant`, `outbox_claim`,
`membership_invite`, `audit_verify_chain`, audit triggers) and each checks its own preconditions.

**Tenant context.** `withTenant` sets `app.tenant_id`, `app.actor_id`, `app.actor_user_id`, `app.correlation_id`
with `set_config(..., true)` inside a transaction (SET LOCAL semantics; values can be bound as parameters).
`app_current_tenant()` returns NULL when unset, so RLS predicates match nothing and inserts fail. A pooled
connection that arrives with session-level context is destroyed and the call fails.

**Keys.** Tenant tables use `PRIMARY KEY (tenant_id, id)` and composite foreign keys including `tenant_id`, so a
row can only reference rows of its own tenant. `tenant_id` defaults to the context tenant.

**Effective dating.** Person and Employment are anchors plus append-only version tables (`effective_from`,
`effective_to` inclusive, DB-stamped `recorded_at`/`recorded_by`). Exclusion constraints forbid overlap; only an
open version may be closed. `role_assignment` is itself an effective-dated fact. Anchors carry `version`, which a
trigger forces to advance by exactly one per update; repositories use `WHERE version = expected`.

**Audit.** `audit_event` is append-only for every role (no grants, plus triggers that reject UPDATE, DELETE,
TRUNCATE). A BEFORE INSERT trigger assigns `seq`, `prev_hash`, `hash` (sha256 over prev hash and canonical
jsonb), `recorded_at` and `txid` under a per-tenant head-row lock. Deferred constraint triggers on sensitive
tables refuse COMMIT unless an audit row for the same tenant, resource and transaction exists. Restricted
fields are audited as `{ "changed": true }` markers, not values or hashes (hashes of birth dates are reversible).

**Outbox.** Events are inserted in the business transaction; workers claim with `SKIP LOCKED` and leases;
effects and the `idempotency_key` row commit together. At-least-once delivery, effectively-once effects.

**Migrations.** Own runner (SQL files, `-- phase:` and `-- owner:` headers, checksums, advisory lock, one
transaction per migration). Contract migrations need `allowContract`; downs need `allowDestructive` and the CLI
refuses them in production. Nothing calls the runner at startup (architecture test).

## Known limitations

- The hash chain detects edits, deletions and tail truncation, but a superuser who rewrites rows **and** the head
  consistently is detectable only after periodic anchoring to an external write-protected store (AUD-06, not built).
- Audit writes serialize per tenant until commit; acceptable for current scale, revisit with the Phase 6 load model.
- Worker claim order is global oldest-first; per-tenant fairness (SAS-05) is not implemented.
- Field encryption and KMS (NFR-01) are pending the Phase 0 hosting decision.
