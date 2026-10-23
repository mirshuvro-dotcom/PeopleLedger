# PeopleLedger

Bangladesh-first, multi-tenant HR, payroll and employee income tax SaaS.

The product baseline is [docs/requirements/PeopleLedger_Product_Requirements_v3.1_Final.md](docs/requirements/PeopleLedger_Product_Requirements_v3.1_Final.md).
Requirement IDs (e.g. `TAX-09`, `LAW-04`) from that document appear in code comments, tests and the
[traceability matrix](docs/traceability/requirements-matrix.md).

> **Status: Phase 0 / first vertical slice.** Production payroll is disabled. The only legal rule pack in the
> repository is the Appendix B **TEST ONLY** pack. Its values are inherited, unverified candidates (evidence
> grade U), and the code refuses to use it in production mode. Nothing here is tax or legal advice.

## What exists today

| Area | Package | Contents |
|---|---|---|
| Shared contracts | `packages/contracts` | Opaque IDs, `IsoDate`, `DecimalString` money, reason-coded `Issue` |
| Platform | `packages/platform` | Tenant / legal entity shapes, tenant boundary assertion |
| People | `packages/people` | Person / Employment split, effective-dated versions with recorded time |
| Pay | `packages/pay` | Exact decimal money, rule-pack schema and governance gate, deterministic `calculatePayroll`, draft bilingual payslip |
| Fixtures | `tests/fixtures/rule-packs` | Appendix B TEST ONLY pack as data |

Not built yet: database, API, web UI, worker, auth, audit, and everything else listed as Planned in the matrix.
See [docs/phase-0/roadmap.md](docs/phase-0/roadmap.md) for the build order.

## Setup

Requirements: Node.js 22.12 or later, pnpm 10 (`corepack enable` will pick up the pinned version).

```sh
pnpm install
pnpm check         # typecheck + all tests
pnpm test          # tests only
pnpm demo:slice    # tenant → employee → snapshot → calculation → draft payslip (synthetic)
pnpm traceability  # regenerate the requirement matrix from Appendix F + status.json
```

## Repository layout

```text
packages/contracts   shared serializable types (no business rules)
packages/platform    tenancy, identity, audit (Platform module)
packages/people      people and organization records (People module)
packages/pay         compensation, payroll and tax kernel (Pay module)
scripts/             demo and generator scripts
tests/fixtures/      synthetic data and TEST ONLY rule packs
docs/requirements    product baseline
docs/architecture    architecture overview and ADRs
docs/compliance      legal source register and rule-pack schema guide
docs/phase-0         roadmap and open questions for the product owner
docs/traceability    requirement matrix (generated) and status source
```

`apps/web`, `apps/api`, `apps/worker`, `packages/time`, `packages/insight` and `infra` from Section 14.1 get created
when their first feature is built, not as empty placeholders.

## Rules for contributors (human and AI)

Read [CLAUDE.md](CLAUDE.md). In short: no invented Bangladesh rates or legal interpretations, no floats for money,
no real employee data, and every change names the requirement IDs it touches.
