# Rule pack schema and governance (salary income tax)

Requirements: LAW-01 – LAW-05, GOV-05, GOV-06. Code: `packages/pay/src/rule-pack.ts`, `load-pack.ts`.

## Shape

A pack is JSON data parsed by `parseSalaryTaxRulePack`, which validates every date and decimal string and rejects
unknown parameters. Top-level fields:

| Field | Meaning |
|---|---|
| `packId`, `version` | Stable identity, e.g. `BD-INCOME-TAX-SALARY@FA2026-draft-1` |
| `incomeYear` | Statutory income year (start/end dates). The engine blocks any snapshot from another year |
| `assessmentYearLabel` | A parameter, because its labelling is itself open (L-25) |
| `status` | LAW-04 workflow state |
| `testOnly` | TEST ONLY packs can never be production assigned |
| `engineCompatibility` | Engine major versions that can interpret the pack |
| `supportedScope` | Residency, pay frequency and currency the pack was written for. Anything else blocks |
| `author` | Used to stop self-approval |
| `parameters` | Typed parameters, each wrapped as `{ value, evidence, openItems }` |
| `approvals` | Stage approvals, each bound to a `contentHash` |

Current parameters: `taxFreeThresholds` (per taxpayer category), `categoryPrecedence` (`null` = no reviewed rule,
so overlapping categories block), `slabs`, `salaryExemption`, `withholdingMethod`, `annualTaxRounding`,
`periodWithholdingRounding`.

New legal mechanisms (investment rebate, perquisites, bonus timing and so on) need reviewed engine code plus new
typed parameters. They are not free-form formulas (LAW-01, ARCH-08).

## Evidence record (GOV-05)

`evidence.grade` is A (primary official text read), B, C, D or U (unverified). Production requires **A** on every
parameter, plus `sourceTitle`/`sourceUrl`/`sectionOrPage`/`sourceHash`/`reviewer` filled. `openItems` lists Appendix
C items that still block the value; any entry blocks production.

## Production gate (`productionAssignabilityIssues`)

A pack is production assignable only if **all** of the following hold:

1. `testOnly` is false.
2. Every parameter has grade A and no open items.
3. There is an approval for each of `source-verified`, `practitioner-reviewed`, `tested` and
   `independently-approved` whose `contentHash` equals the current content hash.
4. The independent approver is not the pack author.
5. Status is `scheduled` or `active`.

The content hash excludes only `status` and `approvals`. Editing any parameter after review silently invalidates
every approval, and flipping `status`/`testOnly` on a draft still fails rules 2 and 3. Tests:
`packages/pay/test/rule-pack.test.ts`.

Still to build: cryptographic signatures on approvals, persistence and workflow transitions with actor checks,
retention of source files, human-readable diff and impact simulation (LAW-07), monthly source review records
(LAW-08).
