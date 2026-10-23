# Build order

The baseline (Section 17, Section 19) asks for Phase 0 outputs plus a small executable vertical slice, then one
bounded feature at a time. This is the proposed order. Each step lists its requirement IDs and exit evidence.

## Done in this increment

**Slice 0: calculation kernel and governance** (in-memory, synthetic)

- Monorepo, strict TypeScript, CI (ARCH-01, ARCH-10).
- Exact decimal money (PRN-06); pure engine with trace and hash (PRN-01, Section 14.3).
- Rule-pack schema with evidence per parameter, open-item blocks and a production gate that resists label tampering
  (LAW-02, LAW-04, LAW-05, GOV-05, GOV-06).
- Explicit blocks for residency, category evidence, overlapping categories, unsupported components, income year
  mismatch and tenant mismatch (PRN-03, TAX-04, TAX-05, TAX-11, EMP-06).
- Average-rate withholding with exact year-end true-up; no negative withholding (TAX-08, TAX-09, TAX-14).
- Draft bilingual payslip, lakh grouping, TEST ONLY watermark (PAY-14 subset, RPT-19).
- Appendix B T-01 to T-05 reproduced as TEST ONLY smoke tests (not golden cases).

**Slice 1: database and tenant isolation layer**

- PostgreSQL migrations 0001–0004 (expand) for tenant, legal_entity, user_account, membership, permission, role,
  role_permission, role_assignment, person(+version), employment(+version), audit_event, outbox_event,
  idempotency_key; own migration runner and CLI (ARCH-05).
- RLS on every runtime tenant table, transaction-local tenant context, composite tenant FKs; pooled-connection
  and worker isolation tests (ARCH-06).
- Append-only hash-chained audit with integrity verification; DB refuses unaudited sensitive changes (AUD-02,
  AUD-03, AUD-08; AUD-06 partial).
- Transactional outbox with idempotent handlers (ARCH-07); workflow state contracts (GOV-02 partial); data
  contracts with schema drift test (GOV-03); module write ownership test (ARCH-04).

**Slice 2: API and developer console**

- Fastify API (`apps/api`): 22 tenant endpoints for organization, people, access and audit, each declared with a
  catalogue permission and scope; decisions inside the tenant transaction; refusals audited; validation, cursor
  pagination, stable error codes (SEC-01 partial, RBAC-16, ARCH-09 partial).
- Next.js developer console (`apps/web`): progress dashboard, requirement matrix, organization, people with version
  history, access & roles with a "why can this user…" check, audit log with chain verification, payroll calculator.
- `pnpm dev:setup` (synthetic tenants through audited repositories) and `pnpm dev`.

**Slice 3: sign-in**

- Migration 0005 and the `pl_auth` role: credentials (scrypt), encrypted TOTP secrets, recovery codes, challenges,
  per-tenant sessions, one-time setup links, append-only authentication events (IAM-01/02/04/05 partial, AUD-01).
- MFA enforced for critical permissions (SEC-05 partial); sessions end on suspension (RBAC-17 partial); CSRF, lockout and
  rate limits (NFR-02 partial). Sign-in, setup-link and My account pages.

## Next bounded features

1. **Passkeys and identity completion.** WebAuthn (IAM-01), per-tenant security policy (IAM-02), user ↔ person link
   (IAM-04), unusual-login alerts (IAM-05, AUD-15).
2. **Audit completion.** Per-period chains and external anchoring, read/export logging, retention per category
   (AUD-04 – AUD-07, NFR-03).
3. **Identity and permissions.** Sign-in and MFA, system role templates, remaining RBAC-03 scopes, field-level
   permissions, maker/checker and delegation on top of the existing membership/role tables (IAM-01, RBAC-01 –
   RBAC-08, SEC-02, SEC-03).
4. **Payroll run lifecycle.** PayrollRun / RunRevision / persisted snapshots; Draft → … → Approved with optimistic
   locking and stale-revision invalidation; duplicate regular run prevention (PAY-06 – PAY-08, GOV-02).
5. **Rule pack registry.** Persisted packs and approvals, LAW-04 transitions with actor checks, signed artifacts,
   diff view (LAW-03, LAW-04, LAW-07).
6. **Posting.** Immutable balanced postings published through the existing outbox (PAY-11, AC-10, AC-19).
7. **Calendars** (CAL-01 – CAL-03, CAL-13 – CAL-16) and then the Time module (ATT, LEV).

Production payroll stays disabled throughout (`LegalEntity.productionPayrollEnabled: false`) until Section 20
conditions are met.
