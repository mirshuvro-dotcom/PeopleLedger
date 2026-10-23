# ADR-0001: TypeScript modular monolith in a pnpm workspace

- Status: Accepted for the vertical slice; to be confirmed in Phase 0 (ARCH-02 asks for a recorded decision)
- Requirements: ARCH-01, ARCH-02, ARCH-03, ARCH-04, ARCH-10

## Decision

- One repository, pnpm workspace, TypeScript in strict mode (`noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`).
- Business modules per Section 14.1: Platform, People, Time, Pay, Insight, plus `contracts` for shared
  serializable types. Each module is a workspace package that owns its rules and (later) its tables.
- Packages export TypeScript source directly (`"exports": "./src/index.ts"`); tests and scripts run through
  Vitest and tsx. A build step is added when the first deployable app (API) needs one.
- Deployment units (web, API, worker) are not created until their first feature. The recommended stack from
  ARCH-02 (Next.js, NestJS, PostgreSQL with RLS, durable queue with transactional outbox) is the default for those
  units; it still needs Phase 0 confirmation of supported versions.

## Pinned tooling (exact versions, lockfile committed)

| Tool | Version | Why this one |
|---|---|---|
| Node.js | ≥ 22.12 (LTS line) | Current LTS available in CI and dev containers |
| pnpm | 10.28.0 | Workspace support, strict dependency isolation |
| TypeScript | 5.9.3 | Last 5.x line; 7.x (native compiler) is newer than we want to adopt before Phase 0 review |
| Vitest | 3.2.4 | Stable, widely used; 4/5 majors to be evaluated in Phase 0 |
| tsx | 4.20.6 | Runs TS scripts without a build |
| decimal.js | 10.6.0 | See ADR-0002 |

## Consequences

- Cross-module calls go through exported functions and types; no deep imports into another package's `src`.
- Upgrading majors is a deliberate change with its own ADR note, not a drive-by.
