# Architecture overview

Modular monolith (ARCH-01) with five business modules and a contracts package. See ADR-0001 and ADR-0002.

| Module | Package | Owns (planned) | Built so far |
|---|---|---|---|
| Platform | `@peopleledger/platform` | Tenant, identity, roles, audit, outbox, notifications, exports | Tenant/entity shapes, `assertTenant` |
| People | `@peopleledger/people` | Person, Employment, assignments, documents, organization | Person/Employment, effective-dated versions |
| Time | `packages/time` (not created) | Calendars, attendance, leave ledger | — |
| Pay | `@peopleledger/pay` | Compensation, payroll runs, tax, postings, payments, rule packs | Engine, rule-pack gate, draft payslip |
| Insight | `packages/insight` (not created) | Reports, performance, appraisal | — |
| Contracts | `@peopleledger/contracts` | Serializable shared types only | IDs, dates, decimals, `Issue` |

## Dependency direction

`contracts` ← every module. `pay` may read People data only through snapshots assembled by an application service;
the calculation engine depends on nothing but `contracts` and `decimal.js`.

## Vertical slice data flow

```text
Tenant ─ LegalEntity ─ Person ─ Employment ─ CompensationAgreement (effective-dated versions)
                                     │
                     snapshot assembly (as of period end, explicit projection + YTD)
                                     │
             calculatePayroll(snapshot, legalPack, policyPack, engineVersion)
                                     │
              result: amounts | blockingErrors, ruleTrace, traceHash, ledgerDraft
                                     │
                          buildDraftPayslip → renderPayslipText(en | bn)
```

Snapshot assembly lives in `scripts/vertical-slice.ts` for now; it moves into a Pay application service when
payroll runs are persisted (roadmap step 4).
