# ADR-0004: Fastify API and Next.js developer console

- Status: Accepted
- Requirements: ARCH-01, ARCH-02, ARCH-09, SEC-01, RBAC-16, NFR-10 (partial)

## Decisions

**API: Fastify 5 (`apps/api`).** ARCH-02 recommends "a structured TypeScript API such as NestJS". We use Fastify
instead: NestJS's dependency injection relies on decorator metadata, which the esbuild-based toolchain used across
the repo (tsx, Vitest) does not emit, so it would need a separate compiler path. Fastify gives schema validation
(Ajv), hooks, `inject()` for in-process tests and few dependencies. Structure is kept explicit instead:

- Every tenant endpoint is declared with `tenantRoute(...)`, which requires a permission from the catalogue (or an
  explicit membership-only marker) and a scope (`tenant`, `entity`, or `row-filtered`). The authorization decision
  runs in the same tenant transaction as the data access; RLS stays as the second barrier.
- Refusals return 403 without revealing whether the target exists, and are audited (`authorization.denied`).
- Request bodies reject unknown fields (`removeAdditional: false`); lists use cursor pagination with a bounded page
  size (ARCH-09). Errors map to stable codes; unknown errors become 500 with only a correlation id.
- Route handlers never write tables directly; they call the owning module's repository (architecture test).

**Web: Next.js 15 with React 19 (`apps/web`).** As recommended by ARCH-02. The first screens are a developer
console for inspecting the build. They call the API through a same-origin `/api` rewrite, so no CORS is needed.

**Developer identity (temporary).** Sign-in (IAM-01) does not exist yet. With `PEOPLELEDGER_DEV_AUTH=enabled` the API
accepts `x-dev-tenant-id` / `x-dev-user-id` headers naming a synthetic user; the console offers a switcher. Every
request is still authorized against that user's real memberships and role assignments, so the console exercises the
production authorization path. The config refuses to start with developer identity in production, and without it
all tenant endpoints return 401 and `/dev/*` routes are not registered (tests cover both).

**Developer data.** `pnpm dev:setup` rebuilds a database whose name must end in `_dev` and seeds two synthetic tenants
through the real, audited repositories. Identities are written to a git-ignored `.dev-seed.json`.

## Pinned versions

| Package | Version |
|---|---|
| fastify | 5.12.5 |
| next | 15.5.27 |
| react / react-dom | 19.1.9 |
| @types/react / @types/react-dom | 19.1.17 / 19.1.11 |

## Consequences

- Replacing developer identity with real sign-in changes only `requestContext()`; routes and tests stay.
- The console is English-only for now (allowed during development by NFR-10); Bangla UI is R1.
