# Phase 0 open questions for the product owner

Found while analysing the v3.1 baseline. None of these block the current software work; each blocks a later gate
until answered.

## Spec consistency (resolved)

1. ~~Requirement count 360 vs 361.~~ Resolved in the updated v3.1 Final baseline: Section 17 and Appendix E.1a now
   say 294 of 361 requirements are R0, matching Appendix F.
2. ~~Section 19.2 prompt referenced the v3 file.~~ Resolved: it now names
   `PeopleLedger_Product_Requirements_v3.1_Final.md`, which is the file name used in `docs/requirements/`.

## Decisions owed in Phase 0 (Section 20, Appendix D)

| Decision | Needed before |
|---|---|
| Confirm first cohort (Section 1.4) and name 2–3 pilot customers | Phase 3 |
| Contract a Bangladesh tax practitioner and labour lawyer (hours, turnaround, budget) | Any pack approval |
| Acquire primary texts (L-27) | Any pack approval |
| Hosting region, subprocessors, data protection basis (NFR-04, L-23, PLT-35) | Storing real data |
| Email provider, bank formats and payment channels (BEFTN/RTGS/MFS) | Phase 2 / Phase 4 |
| Statutory form templates and retention schedules | Phase 3 |
| Confirm stack versions in ADR-0001 (Next.js, NestJS, queue choice) | Phase 1 apps |
| Pricing and plan entitlements | Phase 6 |

## Assumptions made in the slice (to confirm or correct)

- All earnings in the demo are treated as taxable salary for arithmetic only. Real component treatment (house rent,
  medical, conveyance, perquisites) needs an approved pack (TAX-05, L-07).
- Average-rate withholding is computed as (projected annual tax − YTD withheld) ÷ remaining pay opportunities
  including the current period. The exact statutory method under Section 86 and the TDS Rules 2026 is unverified.
- Bangla labels on the payslip (e.g. "উৎসে কর কর্তন", "নিট প্রদেয়") need review by a native-speaking payroll
  professional before any customer sees them.

## Raised by the database and tenancy layer (decisions needed, defaults used are reversible)

1. **Field classification defaults.** The five classes (public, employee, hr-restricted, payroll-restricted,
   medical) have no class for security/system metadata (audit rows, IP addresses, actor ids). Proposed default
   used: `hr-restricted`. Also proposed: sign-in email `employee`, birth date `hr-restricted`, legal names
   `public`. Confirm, or add a `security` class (DOC-02 lists more classes than the five used here).
2. **Retention periods.** Retention classes exist (`db/contracts/entities.json`) but no periods. NFR-05/DOC-17 say
   periods come from the legal pack and tenant policy; none exists. Nothing is deleted automatically meanwhile.
3. **Employment category (EMP-04).** Not stored yet. Should categories be a fixed product list, a tenant reference
   table, or a reviewed `ClassificationDetermination` (Section 14.2)? Left out rather than guessed.
4. **Default system roles (RBAC-01).** Which permissions each Section 3 role gets is a product decision; no system
   roles are seeded. Permission sensitivity levels in the seeded catalogue are proposals.
5. **Re-inviting a revoked member.** `revoked` is terminal and (tenant, user) is unique, so re-inviting the same
   person needs either reactivation or a new membership row. Which?
6. **Tenant-visible account data.** `user_account` holds only email and status so linking an existing account
   discloses nothing (EMP-10). Confirm profile data stays tenant-scoped.
7. **Platform support access.** The platform role currently has no path to tenant data at all. RBAC-13 consented
   support access needs a design (time-boxed grant row + RLS policy, or a separate audited function).
8. **Audit anchoring target.** AUD-06 requires anchoring the chain in a separate write-protected store (e.g. object
   storage with object lock, or an external timestamping service). Depends on the hosting decision.
9. **Field encryption scope.** Which fields need application-level encryption (NFR-01) and which KMS. Depends on
   hosting; no such fields exist in this layer yet.
