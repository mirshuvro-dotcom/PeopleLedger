# Repository instructions

These apply to every contributor, including AI assistants. They condense Section 19 of
`docs/requirements/PeopleLedger_Product_Requirements_v3.1.md`; the document wins on conflict.

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
- **Synthetic data only.** No real names, salaries, bank, NID or TIN values in code, fixtures, logs or prompts.
- **History is immutable.** Effective-dated changes append versions; approved/posted records are corrected by
  linked adjustments, never edits.

## Checks

Run `pnpm check` before committing. Tax, payroll, tenant-boundary, approval and retry logic need meaningful tests
(not snapshot echoes). If you change `docs/traceability/status.json`, run `pnpm traceability`.
Never mark a requirement "Passed" without acceptance evidence for its full text.
