# Repository instructions

These apply to every contributor, including AI assistants. They condense Section 19 of
`docs/requirements/PeopleLedger_Product_Requirements_v3.1_Final.md`; the document wins on conflict.

## Before changing code

- Name the requirement IDs you are implementing and state the data, permission and invariant changes.
- Implement one bounded feature at a time. Do not scaffold modules that have no feature yet.
- Check `docs/architecture/adr/` before changing technology, module ownership or financial invariants. Record
  material changes in a new ADR.

## Hard rules

- **No invented law.** Never add or change a Bangladesh rate, threshold, date, entitlement or interpretation in
  code. Legal values live only in rule-pack data with an evidence record. If a fact is unknown, add a blocking
  `Issue` with a stable reason code and an Appendix C reference, then keep building independent software.
- **Money is exact.** Use `Dec` / `DecimalString` from `@peopleledger/pay` and `@peopleledger/contracts`. No JS
  `number` arithmetic on amounts. Round only where a rule-pack `RoundingRule` says so.
- **The engine is pure.** `calculatePayroll` must not read the clock, environment, database, network or tenant
  settings. Anything it needs goes into the snapshot.
- **Packs are gated.** Do not weaken `productionAssignabilityIssues`. TEST ONLY packs must stay unusable in
  production mode whatever their labels say.
- **Tenant boundary everywhere.** Every read by id passes through a tenant check; errors must not reveal that a
  record exists in another tenant.
- **Database rules.** Every tenant table has `tenant_id`, RLS, composite keys/FKs and a data contract in
  `db/contracts/entities.json`. Run tenant work through `withTenant`; never use session-level `SET`. Write an
  audit event in the same transaction as every sensitive change (the database refuses to commit otherwise).
  Migrations are additive (`-- phase: expand`) unless a reviewed contract migration is intended; never run them
  from application code. A module writes only the tables its contract assigns to it.
- **API rules.** Declare every tenant endpoint with `tenantRoute` and a catalogue permission; add a sample request in
  `apps/api/test/api.db.test.ts` (the suite fails otherwise). Handlers call module repositories, never write SQL.
  Developer identity is a dev-only stand-in for sign-in and must never be enabled in production.
- **Synthetic data only.** No real names, salaries, bank, NID or TIN values in code, fixtures, logs or prompts.
- **History is immutable.** Effective-dated changes append versions; approved/posted records are corrected by
  linked adjustments, never edits.

## Checks

Run `pnpm check` before committing (needs PostgreSQL for `pnpm test:db`). Tax, payroll, tenant-boundary, approval and retry logic need meaningful tests
(not snapshot echoes). If you change `docs/traceability/status.json`, run `pnpm traceability`; if you change
`db/contracts/entities.json`, run `pnpm data-contracts`.
Never mark a requirement "Passed" without acceptance evidence for its full text.
