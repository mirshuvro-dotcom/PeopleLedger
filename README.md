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
| Platform | `packages/platform` | PostgreSQL access layer: tenant context (`withTenant`), RLS, audit chain, outbox and idempotency, authorization decision, migration runner, platform/identity repositories |
| People | `packages/people` | Person / Employment split, effective-dated versions; PostgreSQL repository for person and employment |
| Database | `db/` | Migrations (`db/migrations`), cluster roles (`db/roles.sql`), data contracts (`db/contracts/entities.json`) |
| Pay | `packages/pay` | Exact decimal money, rule-pack schema and governance gate, deterministic `calculatePayroll`, draft bilingual payslip |
| Fixtures | `tests/fixtures/rule-packs` | Appendix B TEST ONLY pack as data |

Not built yet: API, web UI, worker process, sign-in and MFA, and everything else listed as Planned in the matrix.
See [docs/phase-0/roadmap.md](docs/phase-0/roadmap.md) for the build order.

## Setup

Requirements: Node.js 22.12 or later, pnpm 10 (`corepack enable` will pick up the pinned version), and
PostgreSQL 16+ with the `btree_gist` extension for the database tests.

```sh
pnpm install
pnpm check            # typecheck + unit tests + database tests
pnpm test             # unit tests (no database)
pnpm test:db          # database tests; each file creates and drops its own database
pnpm demo:slice       # tenant → employee → snapshot → calculation → draft payslip (synthetic)
pnpm traceability     # regenerate the requirement matrix (fails if a Passed row lacks test evidence)
pnpm data-contracts   # regenerate docs/data-contracts from db/contracts/entities.json
```

Local settings can live in a git-ignored `.env` file: copy `.env.example` to `.env` and fill in your PostgreSQL
password. Database tests connect with `PEOPLELEDGER_DB_ADMIN_URL` (default `postgres://postgres:postgres@localhost:5432/postgres`,
a superuser on a disposable cluster). They create the cluster roles and synthetic login users themselves.

### Running migrations

Migrations never run on application startup. Operators use the CLI with the schema-owner connection:

```sh
export PEOPLELEDGER_DB_MIGRATION_URL=postgres://owner:…@host/peopleledger?sslmode=verify-full
pnpm db roles                                  # once per cluster, as a cluster administrator
pnpm db status
pnpm db up                                     # expand/migrate phases; contract needs --allow-contract
pnpm db down --steps 1 --allow-destructive     # non-production only
```

Runtime services connect as login users that are members of `pl_app`, `pl_worker` or `pl_platform`.
See [ADR-0003](docs/architecture/adr/0003-database-tenancy-audit-outbox.md).

## Repository layout

```text
packages/contracts   shared serializable types (no business rules)
packages/platform    tenancy, identity, audit (Platform module)
packages/people      people and organization records (People module)
packages/pay         compensation, payroll and tax kernel (Pay module)
scripts/             demo and generator scripts
tests/fixtures/      synthetic data and TEST ONLY rule packs
docs/requirements    product baseline
docs/architecture    architecture overview, ADRs, workflow state contracts
docs/compliance      legal source register and rule-pack schema guide
docs/data-contracts  generated entity/field contracts (GOV-03)
db/                  migrations, cluster roles, data contract source
docs/phase-0         roadmap and open questions for the product owner
docs/traceability    requirement matrix (generated) and status source
```

`apps/web`, `apps/api`, `apps/worker`, `packages/time`, `packages/insight` and `infra` from Section 14.1 get created
when their first feature is built, not as empty placeholders.

## Rules for contributors (human and AI)

Read [CLAUDE.md](CLAUDE.md). In short: no invented Bangladesh rates or legal interpretations, no floats for money,
no real employee data, and every change names the requirement IDs it touches.
