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

## Next bounded features

1. **Persistence foundation (Phase 1).** `apps/api` + PostgreSQL migrations for Tenant, LegalEntity, Person,
   Employment, CompensationAgreementVersion; row-level security with transactional tenant context; cross-tenant
   tests (ARCH-05, ARCH-06, PRN-07, AC-01). Entity contracts first (GOV-03).
2. **Audit trail core.** Append-only, hash-chained audit events; failed audit write aborts the action (AUD-01,
   AUD-02, AUD-06, AUD-08).
3. **Identity and permissions.** Users, memberships, `resource:action` catalogue, scoped role assignments, deny by
   default, maker/checker constraints (SEC-01, SEC-02, RBAC-01 – RBAC-06, IAM-01).
4. **Payroll run lifecycle.** PayrollRun / RunRevision / persisted snapshots; Draft → … → Approved with optimistic
   locking and stale-revision invalidation; duplicate regular run prevention (PAY-06 – PAY-08, GOV-02).
5. **Rule pack registry.** Persisted packs and approvals, LAW-04 transitions with actor checks, signed artifacts,
   diff view (LAW-03, LAW-04, LAW-07).
6. **Posting and outbox.** Immutable balanced postings, transactional outbox, idempotent handlers (PAY-11, ARCH-07,
   AC-10, AC-19).
7. **Calendars** (CAL-01 – CAL-03, CAL-13 – CAL-16) and then the Time module (ATT, LEV).

Production payroll stays disabled throughout (`LegalEntity.productionPayrollEnabled: false`) until Section 20
conditions are met.
