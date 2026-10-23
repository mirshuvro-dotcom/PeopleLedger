# PeopleLedger Product Requirements and Development Plan

Version 3.1 (Final baseline) | 23 October 2026 | Bangladesh first multi tenant SaaS | Supersedes v3.0. Appendix E records the v3 and v3.1 changes and Appendix F assigns every requirement to a release.

## 1 Purpose and implementation status

PeopleLedger will manage employee records, HR operations, attendance, leave, performance, appraisal, compensation, payroll, employee income tax and employer withholding obligations for organizations operating in Bangladesh. It must support growth from a small business to multiple legal entities and large employee populations without rewriting its financial or legal foundations.

This document is the implementation baseline for Claude/Codex and human developers. “Must” is mandatory; “should” permits a documented alternative. Requirement IDs are stable and must appear in implementation tickets and acceptance tests. Product scope is defined here; statutory numbers and formulas must be delivered as separately approved, versioned Bangladesh rule packs.

This is the product implementation baseline, not a certified schedule of current tax rates or a legal opinion. V3 and V3.1 revise product controls and delivery scope; it does not newly verify the legal figures inherited in Appendix B. Sections 1 to 33 and Appendices B, C and F are operative; Appendices A and E are change history and Appendix D provides aligned implementation guidance. All requirements remain planned until implementation and acceptance evidence exist. No claim that every employee is legally supported may be made until the applicable scenario matrix has passed independent Bangladesh tax and labour practitioner review.

### 1.1 Product outcomes

- Maintain one reliable, historically accurate employee record across HR and payroll.
- Calculate explainable salary, benefits, deductions and withholding with independently verified rules.
- Change annual and midyear legal rules without changing closed historical results.
- Separate employer obligations from an employee’s personal return and tax liability.
- Make every approval, calculation, correction, payment and statutory deposit traceable.
- Provide employee self service and clear reports without exposing confidential data.

### 1.2 Scope boundaries

All employee categories must be representable in the data model. Automatic statutory processing is enabled only for reviewed legal regimes and scenarios. A scenario outside an approved pack must be blocked or routed into a controlled practitioner calculation workflow; it must never silently use a generic salaried employee formula.

The first commercial release targets approved Bangladesh private sector employer cohorts. EPZ, public service, international assignments, specialized sectors and nonresident cases require separately validated packs before activation. Supporting their records does not imply their legal calculations are implemented.

Applicant tracking, full accounting ERP, general corporate income tax, VAT, full personal asset/wealth return preparation and direct government filing are outside the first commercial release. The system must support relevant declarations, data exports, liabilities and workflow handoffs. Personal return preparation may become a separately scoped future module.

### 1.3 Jurisdiction and legal basis

PeopleLedger is a Bangladesh law product. The legal basis for the first release is limited to the following instruments, each of which must be resolved to its authoritative text and present status in Phase 0:

| Area | Instrument | Notes |
|---|---|---|
| Income tax | Income Tax Act 2023 as amended by the Finance Act 2026 | Finance Act 2026 reported as passed 29 June 2026, gazetted 30 June 2026, effective 1 July 2026 (secondary sources). Income year 1 July to 30 June. |
| Withholding procedure | Tax Deducted at Source Rules 2026 | Reported as issued with the Finance Act 2026. Deposit, certificate and return mechanics must be re-verified against these rules, not the earlier TDS Rules 2024. |
| Labour | Bangladesh Labour Act 2006 as amended by the Labour (Amendment) Ordinance 2025 and the Labour (Amendment) Act 2026 (Act 43 of 2026, 10 April 2026) | Roughly 90 changes; several awaiting subsidiary rules. |
| Labour procedure | Bangladesh Labour Rules 2015 as amended February 2026 | Forms, registers and procedures. |
| Orders | NBR SROs, circulars and forms; Labour ministry notifications; wage board orders | Mid-year changes must be supported (LAW-07). |

Foreign tax law, treaty computation for other countries and multi-country payroll are out of scope until Phase 7. The calculation engine stays jurisdiction neutral internally, but Bangladesh is the only initial rule pack planned. This instrument list is a verification queue, not evidence of enactment, commencement or current legal status. Phase 0 must attach authoritative texts before approving any dependent rule.

Appendix B contains an inherited, unverified Bangladesh seed rule pack reported in v2 as derived from public law firm and press summaries of the Finance Act 2026. Exact supporting citations were not supplied for its individual parameters. It exists so developers have concrete parameters, formulas and test inputs from day one. It is not an approved pack: it loads only in `Draft` status, cannot be activated until the LAW-04 workflow completes, and every number carries an evidence grade.

### 1.4 First commercial cohort (proposed default; the owner confirms in Phase 0)

The first release is activated only for the cohort below. Anything outside it is representable in the data model but blocked from automatic calculation until its pack is approved (Section 1.2).

| Attribute | First cohort | Deferred to later packs |
|---|---|---|
| Sector | Private sector companies in software, services, trading and similar non manufacturing activity | Garments and export manufacturing (wage board rates, high volume daily pay), EPZ, NGO, public service, MPO institutions, banks |
| Size | 20 to 500 employees per tenant, one or several legal entities | Larger populations (supported by scale targets, validated in Phase 6) |
| Employees | Resident Bangladeshi citizens paid monthly in BDT | Non resident individuals, foreign nationals, expatriate packages, foreign currency pay |
| Taxpayer categories | General, woman, age 65 or over, person with disability, third gender, gazetted war wounded freedom fighter and July warrior (each after practitioner approval of its threshold and evidence rule) | Parent or guardian relief for disabled dependants and indigenous exemption until their enactment and conditions are confirmed |
| Pay elements | Basic, cash allowances, festival and performance bonuses, overtime, arrears, loans, employer provided car and accommodation, group insurance | Employee share schemes, employer borne tax and gross up for expatriates, tax equalisation |
| Funds | Recognised provident fund where applicable, gratuity, WPPF where applicable | Unrecognised funds, pension schemes under the new national scheme until confirmed |

### 1.5 Market position and success measures

PeopleLedger competes with global HRIS products that lack Bangladesh payroll (HiBob offers US and UK payroll plus a payroll data hub, not Bangladesh payroll) and with local payroll tools that are strong on compliance but thinner on self service, workflow, audit and reporting. The product thesis is local statutory depth combined with a modern self service and control experience.

| Measure | Proposed target |
|---|---|
| Tax and payroll accuracy | Zero critical computation defects in pilot; every pilot payroll matches independently approved component-level calculations at the legally approved rounding precision; unexplained offsetting differences fail (GOV-07) |
| Time to first payroll | A tenant of 100 employees reaches a validated first payroll within 15 working days of kickoff |
| Rule change responsiveness | A new annual rule pack is live, tested and communicated before the first July payroll |
| Employee self service adoption | At least 80% of employees access payslips through the portal within 60 days |
| Support load | Fewer than 5 payroll related support tickets per 100 employees per month after the third cycle |
| Availability | 99.9% monthly (NFR-07), with a stricter payroll week target set before commercial SLA |

Pricing, packaging and plan limits are Phase 0 decisions. Implement configurable entitlements after those decisions; mandatory security, audit, retention access and applicable compliance controls cannot be sold as optional bypasses (SAS-02).

## 2 Product principles

| ID | Mandatory principle |
|---|---|
| PRN-01 | Every financial result must identify its inputs, calculation engine version and legal rule version. |
| PRN-02 | Legal rules must be separated from company policies. A company policy cannot override a mandatory obligation. |
| PRN-03 | Missing evidence, unsupported classifications and ambiguous legal rules must create explicit exceptions. |
| PRN-04 | Approved and posted financial records are immutable. Corrections use linked adjustment or reversal records. |
| PRN-05 | Employee, policy and compensation history must be effective dated. Recording a change today must not erase what applied previously. |
| PRN-06 | Money must use exact decimal arithmetic. Binary floating point is prohibited in financial calculations. |
| PRN-07 | Every data access path, background job, report, file and integration must enforce tenant and role boundaries. |
| PRN-08 | AI may assist development and draft explanations. It must not choose production legal rules or approve payroll. |

## 3 Users and authorization

| Role | Default access |
|---|---|
| Platform operator | Tenant provisioning, availability and subscription operations; no routine access to salary, bank or tax data. |
| Organization owner | Organization administration; financial access requires an explicit financial role. |
| HR administrator | Employee lifecycle, leave policies and approved HR information. |
| Payroll preparer | Compensation setup, payroll preparation and correction proposals. |
| Payroll approver | Review and approve payroll within assigned entities and pay groups. |
| Finance or treasury officer | Salary payment instructions, bank reconciliation, withholding deposit reconciliation. |
| Tax practitioner | Legal packs, evidence review and assigned tax exceptions; approval permission is explicit. |
| Line manager | Authorized direct or delegated reports, leave and performance workflows. Salary access is separately granted. |
| Employee | Own approved records, requests, declarations, payslips and released reviews. |
| Auditor | Read only access to assigned records, calculations and audit evidence. |

- SEC-01: Use role and attribute based authorization with tenant, legal entity, employee relationship, field and action scopes. Deny by default.
- SEC-02: Enforce maker/checker separation for payroll, bank account changes, compensation changes, legal pack activation and payment release. A person must not approve their own sensitive change using another role. These prohibitions apply across alternate accounts linked to the same person, delegated access, service accounts and emergency access. They are non-overridable; an unavailable checker requires a different authorized person, not self-approval.
- SEC-03: Delegation must have a scope, start/end date, absence cover and full audit history; prevent approval loops.
- SEC-04: Support emergency access only through a time limited, justified and logged process with customer authorization and after action review.
- SEC-05: Require MFA for privileged users and sensitive approvals. Support enterprise SSO in a later phase without redesigning identity.

## 4 Organization administration

- ORG-01: Support tenants containing multiple legal entities, branches, locations, departments, teams, cost centres, grades, designations and reporting lines. Prevent circular management relationships.
- ORG-02: Store entity registration, TIN, tax jurisdiction, establishment type, industry, applicable labour regime, bank accounts, signatories and statutory registrations with supporting evidence.
- ORG-03: Configure pay groups, payment frequencies, payroll cutoffs, working weeks, holiday calendars, shifts, probation, notice periods and fiscal/reporting periods.
- ORG-04: Distinguish company financial year, payroll period, statutory income year, assessment year and date of payment. Never infer all from the current calendar year.
- ORG-05: Provide versioned approval policies, required fields, document templates, notifications, reason codes and validation settings.
- ORG-06: Allow custom fields through typed definitions, validation, access restrictions and report mappings. Custom fields cannot bypass statutory validation.
- ORG-07: Separate platform supplied legal packs from employer policy packs. Show the source and precedence of every effective setting.
- ORG-08: Maintain an applicability checklist before enabling payroll for an entity. Unsupported legal regimes must remain visibly disabled.

## 5 Employee information and lifecycle

- EMP-01: Separate Person, Employment and Assignment records. One person may have successive employments, concurrent assignments or authorized employments in separate entities. Rehire must preserve earlier history.
- EMP-02: Store legal/preferred names, Bangla names, birth date, contacts, addresses, emergency contacts, citizenship, nationality, identity documents, passport and work authorization when applicable.
- EMP-03: Store employee identifier, hire/service dates, confirmation, contract dates, employment category, actual duties/classification evidence, grade, location, manager, working pattern and exit details.
- EMP-04: Represent permanent, probationary, temporary, fixed term, casual, part time, apprentice, trainee/intern, daily/hourly/piece rated, executive/managerial and other legally recognized categories. Treat contractors, directors and consultants as distinct engagement classifications with reviewed tax treatment. Contract labels alone must not determine legal worker status.
- EMP-05: Store e-TIN, tax residency determination, country/day counts where needed, tax category, eligibility evidence, return submission evidence, prior employer income and tax, approved investment declarations and exemption documents. Sensitive tax category fields must have restricted access.
- EMP-06: Support male, female, third gender, qualifying older people, persons with disabilities and other legally recognized relief categories. Store exact category eligibility rules and reference dates in the legal pack. Overlapping eligibility must use an explicit reviewed precedence rule, never arbitrary addition of allowances.
- EMP-07: Support eligible disability related dependent/guardian relief where lawful, with consent, proof and prevention of duplicate claims. Birth date alone must not establish every age related entitlement.
- EMP-08: Version compensation, bank details, assignments and tax declarations. Record effective time and recorded time so backdated corrections are identifiable.
- EMP-09: Provide onboarding, document collection, acknowledgements, probation review, transfer, promotion, suspension, extended leave, separation, death in service and rehire workflows.
- EMP-10: Support identity duplicate warnings with controlled merges. Do not reveal a person’s presence in another tenant. Store attachments in private storage with malware checks and expiry reminders.
- EMP-11: Offboarding must revoke access, handle asset/loan clearance and route final pay, statutory benefits, outstanding leave, tax documents and authorized nominee payments where relevant. HR exit approval cannot erase an unpaid financial obligation.

## 6 Attendance and leave

- ATT-01: Support manual entry, approved CSV import and adapter based device/API imports. Preserve raw events, source identifiers and normalized attendance separately.
- ATT-02: Handle overnight shifts, late arrivals, early departures, breaks, remote work, holidays, weekly rest, missed punches and approved corrections. Calculate work dates in the assigned location timezone.
- ATT-03: Define overtime eligibility, approval, hours, caps, rest day treatment and wage base through applicable legal/policy rules. Approval and eligibility are separate facts.
- ATT-04: Missing device data must create an exception, not automatically turn paid work into unpaid absence. Lock approved payroll attendance snapshots.
- LEV-01: Configure leave types, eligibility, statutory minimums, accrual, opening balances, carry forward, expiry, encashment, advance leave, maximum balances, attachments and approval chains.
- LEV-02: Support casual, sick, earned/annual, maternity and additional company leaves. Applicable entitlements, eligibility periods and maternity treatment must come from reviewed current rules rather than fixed numbers in application code.
- LEV-03: Handle half day/hourly leave, overlapping requests, negative balance permissions, holidays within leave, joining/leaving midyear, suspension, probation, contract changes and location calendar changes.
- LEV-04: Use a leave ledger containing accrual, reservation, approval, consumption, cancellation, expiry and encashment entries. Concurrent requests must not overspend a balance.
- LEV-05: Approved leave changes after payroll cutoff must create a future adjustment or authorized off cycle correction. Do not silently change a posted payroll.
- LEV-06: Generate leave balance, leave movement, absence and encashment reports. Support lawful statutory registers and retention requirements through versioned templates.

## 7 Performance evaluation and appraisal

- PER-01: Configure probation, annual, quarterly and custom cycles with eligibility dates, review periods, deadlines, forms and participant roles.
- PER-02: Support objectives, KPIs, competencies, weighted ratings, evidence, self review, manager review and optional peer/360 feedback. Validate weights and rating scale versions.
- PER-03: Workflow must support draft, submitted, manager reviewed, calibration, approved, employee released, acknowledged and closed states with explicit transition permissions.
- PER-04: Define anonymity, confidential notes and release visibility for each reviewer type. Private notes must never appear in employee exports accidentally.
- PER-05: Support reviewer reassignment, manager changes, leave during a cycle, joining midcycle, appeals, improvement plans and controlled reopening with history.
- APR-01: Appraisal recommendations may propose increases, bonuses, promotion or grade change. They require budget and compensation approval before generating future effective compensation records.
- APR-02: A performance rating must never directly change a payslip. Retroactive appraisal increases must use approved arrears adjustments.
- APR-03: Store calibration decisions and objective reasons. Provide completion, score distribution, recommendation, compensation impact and appeal reports with restricted access.

## 8 Employee communication

- COM-01: Send transactional notices, onboarding reminders, leave decisions, review tasks, tax declaration requests, policy announcements and payroll notifications through a queued email service.
- COM-02: Provide audience selection by authorized organization attributes, recipient preview, template variables, approval where configured, scheduling, language selection and delivery history.
- COM-03: Record template version, recipients, sender, approval, provider event, bounce and failure reason. Use idempotency keys and bounded retries to avoid repeated messages.
- COM-04: Send payslip availability links by default. Links must expire and require authentication; do not email salary, bank details, identity numbers or sensitive tax documents in ordinary message bodies.
- COM-05: Configure verified sender domains with SPF, DKIM and DMARC readiness checks. Distinguish mandatory employment notices from optional announcements. Do not promise inbox placement.
- COM-06: Employee email changes must invalidate obsolete document invitations and require verification as appropriate. Email failure cannot mark an acknowledgement as completed.

## 9 Compensation and payroll

### 9.1 Salary components

- PAY-01: Configure basic pay, allowances, overtime, commissions, incentives, festival/performance bonuses, arrears, reimbursements, benefits in kind, loan recovery, advances, authorized deductions and employer contributions.
- PAY-02: Each component must define currency, frequency, amount/formula, eligibility, proration, tax mapping, statutory wage base mappings, accounting mapping, effective dates and rounding. There must not be one universal “basic” or “gross” base for all benefits.
- PAY-03: Support fixed gross, component based and reviewed net pay/gross up contracts. Define gross up iteration limits and fail on nonconvergence.
- PAY-04: Handle joining/leaving midperiod, unpaid leave, pay changes midmonth, hourly/daily/piece rates, multiple bonuses, off cycle pay and retroactive adjustments. Define and expose the proration denominator used.
- PAY-05: Define month end, leap year and nonworking day treatment explicitly. Block cyclic component formulas and unauthorized deductions; apply statutory restrictions and protected minimums where applicable.

### 9.2 Payroll lifecycle

`Draft → Validated → Calculated → Reviewed → Approved → Posted → Payment pending → Partially paid or Paid → Reconciled`

Cancellation is allowed only before posting. Postings may be reversed through linked compensating entries; paid items require appropriate recovery/refund or adjustment handling. “Approved”, “posted”, “paid” and “tax deposited” are independent facts.

- PAY-06: Snapshot employee data, attendance, leave, components, year to date balances, tax inputs and legal/policy versions for each calculation revision.
- PAY-07: Invalidate downstream approval if a draft input changes. Use optimistic locking and a frozen run revision to prevent approval of a stale result.
- PAY-08: Prevent duplicate regular payroll for one employment/pay group/period and prevent paying the same payable twice. Model off cycle runs explicitly.
- PAY-09: Provide employee level calculation traces and comparison against previous payroll, headcount, bank changes, negative net pay and unusual deductions. Exceptions require reasons and assigned owners.
- PAY-10: Permit a blocked employee to be excluded from a run only through explicit approval; retain their outstanding obligation, due date and exception. Never represent an incomplete run as fully processed.
- PAY-11: Post a balanced payroll subledger with earnings, employee deductions, employer costs, net pay payable, tax payable, fund payable and settlement balances. Link all lines to their source calculations.
- PAY-12: Prepare versioned bank instructions with dual release approval, integrity checks and supported bank formats. Export is not proof of payment. Record acknowledgement, individual rejection, partial success, retry and reconciliation evidence.
- PAY-13: Late salary payments, manual bank payments and returned payments must remain visible. A retry must reuse the payable identity and must not create another salary expense.
- PAY-14: Generate authenticated downloadable payslips with entity/employee identity, period, component detail, gross, deductions, tax withheld, net pay, year to date figures, reference and revision. Mark corrections and distinguish taxable noncash value from cash due.

### 9.3 Benefits and final settlement

- BEN-01: Provide scheme specific PF, pension, gratuity, insurance, benefit and contribution records where applicable. Recognition/approval status, membership, contribution base, employer share, vesting, earnings allocation and tax treatment must be versioned.
- BEN-02: PF applicability cannot be determined by headcount alone. Model establishment coverage, qualifying worker count and date, other statutory conditions, pension alternatives, approvals and scheme status through a reviewed decision table.
- BEN-03: Maintain separate employee/employer fund ledgers, remittances and reconciliation. A payroll deduction is not evidence the fund received money.
- BEN-04: Final settlement must distinguish resignation, termination, dismissal, retrenchment, retirement, contract expiry and death, including applicable service length, notice, compensation, gratuity/PF, leave encashment and tax treatment.
- BEN-05: Avoid double counting overlapping statutory/company benefits. Support disputed amounts, partial settlement, loans, asset clearance and payments to eligible nominees/heirs following reviewed procedures.
- BEN-06: Applicable PF, final settlement and required certificates are prerequisites for the relevant customer cohort’s first production payroll; they cannot be deferred merely because advanced benefits are scheduled later.

## 10 Bangladesh employee tax and withholding

### 10.1 Separate financial responsibilities

The system must distinguish projected employee annual liability, employer payroll withholding, employer tax deposits, employee personal advance income tax, prior employer withholding, other source credits, and any employee return balance/refund. “AIT” must never be one ambiguous field.

- TAX-01: Store each tax payment/credit with type, payer, taxpayer, period, amount, challan/reference, date, evidence, verification and permitted application. Prevent duplicate evidence/credit use.
- TAX-02: Employer salary withholding must use the applicable statutory method. An employee’s personal AIT, other income or declared investment cannot automatically reduce employer withholding; the rule pack must explicitly authorize the treatment and required evidence.
- TAX-03: Employer deposited withholding must reconcile to deductions and employee allocations. Keep deducted, payable, deposited, allocated, corrected and reported balances distinct.

### 10.2 Calculation inputs and process

- TAX-04: Determine legal entity, income year, assessment year, residency, income source, employment status, eligible category and applicable rule pack before calculating.
- TAX-05: Classify each cash/noncash component: salary, bonus, overtime, allowance, reimbursement, accommodation, vehicle, concessional loan, employer paid tax, fund contribution, equity benefit, gratuity, compensation and other employment receipts as applicable. Each needs a reviewed treatment or an explicit unsupported exception.
- TAX-06: Apply approved valuation, exclusion, exemption, caps, taxable employment income, slabs, eligible rebate, minimum tax, surcharge and credit ordering only where applicable. Retain separate intermediate amounts and explain the sequence.
- TAX-07: Keep personal net wealth or other income information optional and restricted unless needed for an approved calculation. If it is needed but unavailable, show an unresolved determination; do not imply the payroll result is a complete personal tax liability.
- TAX-08: Project remaining regular pay, expected bonuses and known changes; reconcile actual paid amounts and valid prior employer figures. Projection assumptions must be visible and adjustable with approval.
- TAX-09: Allocate remaining withholding using the approved statutory method, including remaining pay opportunities, off cycle bonuses and final pay. Handle zero remaining periods without division by zero or silent waiver.
- TAX-10: Support partial year work, joining late, multiple employers, concurrent employment, foreign currency compensation, transfers between entities and prior employment corrections without duplicate relief or credits.
- TAX-11: Support resident/nonresident and foreign national cases only with a reviewed applicability pack, day count/reference date logic and relevant evidence. Nationality is not equivalent to tax residency. Treaty treatment requires an approved determination and supporting documents.
- TAX-12: Handle changes in category, age eligibility, disability evidence, residency, TIN/return evidence and law during a year using the relevant legal reference date and transition rules.
- TAX-13: Handle taxable bonuses, arrears and retroactive increases according to legally approved attribution and payment timing rules. Do not automatically assign arrears to the earning year or payment year without a rule.
- TAX-14: Preserve signed withholding adjustments. Overwithholding must not automatically create a cash refund or a negative remittance; use a legally approved correction/refund process and maintain an exception where employer recovery is unavailable.
- TAX-15: Support tax borne by employer, tax equalization/expatriate arrangements and special remuneration only when the relevant specialist pack is approved. Otherwise block automatic calculation.
- TAX-16: Generate versioned salary/tax deduction certificates, withholding registers, employee reconciliations, annual statements and required submission datasets. Certificate values must identify whether they represent deductions or deposits under the approved form.
- TAX-17: Support income year closure, declaration deadlines, evidence completion, reconciliation, certificate issuance and amendments. A closed year cannot be overwritten by a new annual pack.

### 10.3 Required scenario catalogue

Each row needs ordinary cases, boundary values, missing evidence cases, corrections and independently approved expected results. This catalogue establishes minimum coverage, not a claim that every possible fact pattern has been certified.

| Scenario family | Required cases |
|---|---|
| Category eligibility | Male, female, qualifying older person, disability, third gender, any additional statutory categories, overlapping relief, disputed/expired evidence. |
| Income thresholds | Zero income, below/at/above each exemption/slab/cap/minimum threshold; decimal rounding boundaries. |
| Employment pattern | New joiner, leaver, rehire, concurrent employers, prior employer pay, unpaid leave, suspended employment, no regular pay but bonus. |
| Pay components | Multiple festival bonuses, incentive, overtime, arrears, reimbursements, noncash benefits, employer tax gross up. |
| Funds and settlement | Recognized/unrecognized scheme, employee/employer contributions, withdrawals, gratuity, encashment, termination and death benefits. |
| Declarations | Eligible/ineligible investments, late proof, amended declaration, duplicate credit, unavailable personal income data. |
| Residency | Day count boundaries, nonresident, foreign national, assignment changes, treaty claim pending or approved. |
| Withholding | Under/overwithholding, previous employer correction, employee AIT, late deposit, mismatched challan, partial remittance, amended certificate. |
| Timing | Income/assessment year rollover, midyear amendment, retrospective rule, payment after exit, zero remaining pay periods. |
| Special receipts | Equity/share benefits, foreign currency, director/consultant receipts and special sector relief through dedicated reviewed treatment. |

## 11 Legal and policy rule engine

- LAW-01: Use structured, typed rule packs interpreted by a deterministic engine. Store numeric parameters and decision tables as data. Support new legal mechanisms through reviewed engine code; configurability does not mean every future law can be changed without code.
- LAW-02: Rule metadata must include ID, jurisdiction, legal regime, topic, source title/URL, section/page, source file hash, publication date, commencement/effective dates, income/assessment year, applicability predicate, parameters/formula, precedence, rounding and transition treatment.
- LAW-03: Record reviewer identity, rationale, review date, approval, expiry/review due date, scenario tests and superseded/superseding relationships. Retain the reviewed source file where permitted.
- LAW-04: Workflow: Draft → Source verified → Practitioner reviewed → Tested → Independently approved → Scheduled/Active → Superseded/Withdrawn. Authors cannot approve their own pack. Budgets, proposals and news reports cannot become active law merely through import.
- LAW-05: Missing, conflicting, expired or unapproved rules must block affected calculations. Show the reason and required resolution. A UI toggle cannot convert an unknown tax treatment into zero tax.
- LAW-06: Practitioners may resolve a scenario through a signed, evidence backed determination with independent approval. This is a new audited input/determination, not permission to bypass validation. Preserve the original exception.
- LAW-07: Show a human readable diff and impact simulation before activation. Existing approved runs retain their versions; changed law triggers an explicit retrospective adjustment process when legally required.
- LAW-08: Run a source review at least monthly, during budget changes and before each production payroll; record the review even if no change is found. An external source alert may open a review task but must not publish a rule automatically.
- LAW-09: Payroll result reproduction must use the original pack and engine artifact, not today’s active settings. Withdrawal of a pack prevents new use while retaining historical evidence and correction workflow.
- LAW-10: Company policy may add benefits where lawful; statutory floors, ceilings and mandatory requirements must remain enforced. Conflicting company settings must fail validation.

### 11.1 Required source mapping register

Before enabling a customer cohort, practitioners must complete a register covering employment classification, working time/overtime, wages/deductions, leave/maternity, notice/separation, PF/pension, gratuity, relevant welfare/profit participation obligations, payroll tax, remittances, certificates, records and privacy.

For each obligation record its legal basis, applicability facts, required action/calculation, deadline, evidence, responsible role, tests and supported release. Explicitly distinguish applicable, not applicable with justification, and unsupported. Public sector and EPZ regimes require separate assessment. Do not blanket apply the general Labour Act to every employee or establishment.

### 11.2 Official source baseline reviewed for this document

These are source discovery references, not an approved production pack. The official index identifies the Bangladesh Labour Amendment Act 2026, Act 43, dated 10 April 2026. NBR lists a 2026–27 income tax circular. Consequently, a 2025 only baseline is insufficient. Individual provisions and their commencement/transition must be reviewed before implementation.

- Bangladesh Labour Amendment Act 2026: https://bdlaws.minlaw.gov.bd/act-1672.html
- Bangladesh Labour Act 2006 consolidated source: https://bdlaws.minlaw.gov.bd/act-952.html
- NBR income tax acts index: https://nbr.gov.bd/acts/income-tax/eng
- NBR income tax circulars: https://nbr.gov.bd/taxtypes/income-tax/income-tax-paripatra/eng
- NBR publications including income tax guidance: https://nbr.gov.bd/publications/income-tax/eng

The full labour statute pages could not be reliably fetched during this review. The NBR acts URL also did not load. No numerical entitlement, tax slab or PF trigger in this specification should be interpreted as verified current law. Phase 0 must resolve the applicable authoritative texts, annual finance legislation, amendments, rules, SROs, gazettes and forms, including their present legal status. Practitioner approval is a production release dependency, not a request to postpone building the software.

## 12 Reporting and employee self service

- REP-01: Provide employee headcount/movement, demographics with appropriate privacy controls, probation/contract expiry, turnover, attendance, overtime, leave, performance completion and appraisal reports.
- REP-02: Provide payroll register, component analysis, cost centre/entity costs, variance, payslip, salary payment/rejection, loan/advance and final settlement reports.
- REP-03: Provide taxable income, category applicability, exemptions, withholding, deposit/challan allocation, outstanding remittances, tax credit evidence, year end reconciliation and certificate reports.
- REP-04: Provide PF/pension/contribution, gratuity/benefit liability where supported, statutory register, compliance deadline, rule version and audit history reports.
- REP-05: Every financial report must specify entity, period, filters, status, as of time, currency, source revision and generated time. Distinguish draft projection from posted actual and deduction from payment/deposit.
- REP-06: CSV/XLSX/PDF exports must reconcile to source ledgers, enforce row/field security, prevent spreadsheet formula injection and use expiring authenticated downloads. Large exports run asynchronously.
- REP-07: Employee self service must include own profile change requests, leave/attendance corrections, declaration submission, payslips, tax certificates, benefit summaries and released performance reviews.
- REP-08: Dashboard and report totals must reconcile to detail. Prescribed reports must use current approved templates and disclose incomplete evidence.

## 13 Multi tenant SaaS operation

- SAS-01: Support tenant provisioning, owner verification, invitations, plan assignment, employee/usage limits, suspension, cancellation and offboarding.
- SAS-02: Subscription billing must be separate from employee payroll ledgers. Payment provider integrations may follow later; the initial plan lifecycle can use approved manual billing.
- SAS-03: Plan downgrade or subscription expiry must not delete records or obstruct legally required access/export. Define an audited read only retention/offboarding process with contractual terms.
- SAS-04: Give customers complete authorized exports and an exit manifest. Tenant deletion must respect legal holds, retention schedules, backups and deletion evidence.
- SAS-05: Isolate per tenant quotas, concurrent jobs, email limits and report load. A large customer must not monopolize payroll workers.

## 14 Architecture and maintainability

### 14.1 Initial architecture

ARCH-01: Build a modular monolith with a web application, typed server API, isolated calculation domain, asynchronous workers, PostgreSQL and private object storage. Share one repository and release process initially. Extract services only when scaling or ownership evidence justifies the operational cost.

ARCH-02: Recommended implementation baseline: TypeScript, Next.js web UI, a structured TypeScript API such as NestJS, PostgreSQL and a durable job queue with transactional outbox. Select stable supported versions in Phase 0, record the decision and pin dependencies/lockfiles. Exact library versions are implementation decisions requiring current verification, not requirements fixed by this document.

ARCH-03: Keep tax/payroll functions independent of UI, HTTP frameworks, database clients and email providers. Use explicit decimal values and serializable input/output contracts. Database transactions and authorization belong in application services, not client components.

Authoritative initial module structure: Platform, People, Time, Pay and Insight. These are business ownership boundaries inside a modular monolith, not five separately deployed services. Keep payroll and tax subdomains explicit inside Pay; performance and reporting remain separate subdomains inside Insight. Initial deployment units are web, API and asynchronous worker. This section and Appendix D describe the same architecture.

```text
apps/web
apps/api
apps/worker
packages/platform
packages/people
packages/time
packages/pay
packages/insight
packages/contracts
infra
docs/architecture
docs/compliance
tests/fixtures
```

- ARCH-04: Modules own their business rules and table writes. Cross module writes must use defined services/events; shared contracts must not become an unrestricted business logic package.
- ARCH-05: Use schema migrations, foreign keys, scoped uniqueness, check constraints, optimistic versioning and transactions. Prefer expand/migrate/contract for live schema changes; never run destructive migrations automatically on production startup.
- ARCH-06: Use database tenant isolation such as PostgreSQL row level security plus application authorization. Set/reset tenant context transactionally and test worker/pooled connection behavior. Cross tenant foreign key references must be impossible.
- ARCH-07: Use a transactional outbox to publish jobs after database commits. Assume at least once delivery; make handlers idempotent with stable keys and unique constraints. A queue retry must not post payroll twice.
- ARCH-08: Use a restricted formula DSL or typed expression tree with allowed operations, dependency checks and resource limits. Never evaluate tenant supplied JavaScript, SQL or arbitrary executable code.
- ARCH-09: Version APIs and webhook payloads; validate all inputs server side. Use cursor pagination, bounded query limits, asynchronous bulk actions and tenant scoped cache keys.
- ARCH-10: Track architecture decisions, module contracts, setup, environments, runbooks, migration instructions and legal pack authoring. Maintain a supported upgrade path and dependency security updates.

### 14.2 Core data model

| Domain | Required aggregates or records |
|---|---|
| Identity | Tenant, User, Membership, RoleAssignment, Permission, Delegation, Session. |
| Organization | LegalEntity, Establishment, Department, Location, CostCentre, Position, PayGroup, Calendar. |
| People | Person, Employment, AssignmentHistory, ClassificationDetermination, EmployeeDocument, BankAccountVersion. |
| Time | AttendanceEvent, AttendanceRevision, ShiftAssignment, LeavePolicyVersion, LeaveRequest, LeaveLedgerEntry. |
| Performance | ReviewCycle, FormVersion, Goal, ReviewAssignment, ReviewResponse, Calibration, Appeal, AppraisalDecision. |
| Compensation | SalaryComponentVersion, CompensationAgreementVersion, BenefitMembership, Loan, RecoverySchedule. |
| Payroll | PayrollRun, RunRevision, EmployeeCalculation, CalculationInputSnapshot, PayslipVersion, LedgerPosting, Adjustment. |
| Tax | TaxProfileVersion, Declaration, Evidence, PriorEmploymentIncome, TaxCalculation, WithholdingEntry, PersonalCredit, CertificateVersion. |
| Statutory payments | Remittance, Challan, Allocation, Submission, Acknowledgement, ComplianceDeadline. |
| Cash payments | Payable, PaymentInstruction, PaymentAttempt, BankResponse, Reconciliation, RefundRecovery. |
| Rules | LegalSource, LegalDetermination, RulePackVersion, PolicyVersion, RuleApproval, GoldenTestCase. |
| Platform | AuditEvent, OutboxEvent, JobExecution, Notification, ExportJob, Subscription, RetentionPolicy. |

Use opaque identifiers, tenant/entity scope, timestamps, actor IDs and record versions. Store dates separately from timestamps. Financial snapshots and historical references must survive employee deactivation. Effective dated intervals must not overlap where a single active value is required. Avoid unnecessary copies of identity data in calculation traces.

### 14.3 Calculation contract

```text
calculatePayroll(snapshot, legalPack, policyPack, engineVersion)
  -> earnings, nonCashBenefits, deductions, employerCosts,
     taxableIncome, projectedAnnualTax, periodWithholding,
     netPay, ledgerDraft, ruleTrace, warnings, blockingErrors
```

The same validated input and versions must produce identical outputs and trace hashes. The function must not read the current clock, active tenant configuration, live exchange rates or remote APIs. All required values, dates and approved exchange rates are explicit snapshot inputs. Rounding points and reconciliation residuals are defined by the relevant approved rules.

## 15 Security privacy and resilience

- NFR-01: Encrypt traffic, private storage and backups. Protect particularly sensitive identifiers and bank/tax data using managed keys, access controls and appropriate field encryption. Redact logs and traces.
- NFR-02: Implement secure sessions, MFA, invitation expiry, account recovery controls, brute force protection, CSRF/XSS/injection defenses, file validation and malware scanning. Test broken object and field level authorization.
- NFR-03: Maintain tamper evident audit history for reads/exports of sensitive data and all financial/security changes. Record actor, tenant, target, time, reason, before/after reference and correlation ID. Never log secrets or full sensitive payloads.
- NFR-04: Define purpose, data minimization, applicable Bangladesh privacy requirements, processing agreements, hosting/subprocessor locations, access controls and transfer restrictions during Phase 0. No unverified assertion that all Bangladesh data must be locally hosted.
- NFR-05: Use entity/record specific retention schedules, legal holds, secure deletion and audit evidence. Do not hardcode one retention period for all documents.
- NFR-06: Establish encrypted backups and point in time recovery with a proposed production RPO of 15 minutes and RTO of 4 hours. Test restoration before launch and at least quarterly. A failed recovery test blocks rollout expansion.
- NFR-07: Initial availability target is 99.9% monthly, measured for the application service; define exclusions and incident handling before commercial SLA commitments.
- NFR-08: Provide structured logs, metrics, tracing, tenant scoped correlation and alerts for failed payroll jobs, unbalanced postings, stuck approvals, email failures, overdue deposits and queue lag.
- NFR-09: Use graceful degradation: email/report failure must not corrupt payroll, and a database/job failure must not leave half posted ledgers.
- NFR-10: UI must be responsive, keyboard accessible and target WCAG 2.2 AA. Support Unicode/Bangla names and documents and localized templates. Bangla and English payslips and transactional templates are required for R0; complete Bangla and English UI is R1 under Appendix F. English-only internal screens are acceptable during controlled development/pilot where users can operate them.
- NFR-11: Use Asia/Dhaka for Bangladesh business dates by default and UTC for event timestamps. Display timezone and BDT consistently; preserve original foreign currency and conversion evidence where supported.
- NFR-12: Never use production HR/payroll data in developer prompts or external AI tools without a separately approved data processing policy. Use synthetic fixtures by default.

### 15.1 Measurable scale targets

Proposed launch engineering targets, to be validated with a documented load model and deployment budget in Phase 0:

| Metric | Target |
|---|---|
| Reference deployment | 100 tenants and 100,000 active employee records overall. |
| Largest benchmark tenant | 10,000 active employees with representative historical payroll. |
| Concurrent interactive users | 500 across tenants under a specified read/write mix. |
| Ordinary API response | p95 below 750 ms under the reference workload; bulk calculations/exports excluded. |
| Payroll calculation | 10,000 standard employee cases within 15 minutes on declared infrastructure; excludes human review and external services. |
| Reliability | No lost/duplicate financial posting during retry, timeout, worker crash or concurrent request tests. |

Benchmark data must include realistic history, indexes, file/report load and tenant isolation. Publish the result and limitations before launch; adjust deployment capacity rather than silently reducing supported limits.

## 16 Integration and migration

- INT-01: Provide staged CSV/XLSX imports for organization, people, salary, leave balances, attendance, loans, funds and opening tax/payroll figures. Validate file structure, duplicates, references and totals before committing.
- INT-02: Imports require dry run, row level errors, reconciliation, approval, batch ID and repeat protection. Imported prior employer tax must retain evidence and remain distinguishable from PeopleLedger withholding.
- INT-03: Build adapters for email, bank exports, accounting journals, attendance devices and future APIs. Keep provider credentials in a secret manager with rotation and minimum scopes.
- INT-04: Government e-TDS/e-Return/challan integrations require a verified supported interface and lawful authorization. Initial releases may generate approved exports and record manual submission/acknowledgement; never label an export as filed.
- INT-05: Webhooks must be signed, timestamped, replay protected and retryable. External failures must produce reconciliation exceptions.
- INT-06: Migration cutover must reconcile employee counts, leave/fund balances, loans, year to date salary, tax deducted, deposits, open liabilities and bank payment status. Preserve the source and cutover date.

## 17 Development phases and release gates

Durations are planning ranges for a small experienced team (about 6 to 9 engineers, one designer, one QA lead, a payroll product owner) with Bangladesh tax practitioner and labour lawyer hours contracted. AI coding assistance does not remove design, review, QA or legal review dependencies. The original v1 table implied 23 to 37 weeks. Phases 0 to 4 below sum to 34 to 48 weeks if run strictly one after another, and the R0 scope in Appendix F (294 of 361 requirements, counting split-scope items by their first release) is large for a team of this size. Plan 11 to 15 months to the first live payroll and re-estimate in Phase 0, because payroll validation is calendar bound (parallel monthly cycles cannot be compressed) and legal review has external lead times. Reaching R1 (Phase 6) takes additional time. Estimate again after Phase 0; overlap work only after its contracts are stable.

| Phase | Planning range | Deliverables | Exit gate |
|---|---|---|---|
| 0 Discovery and legal baseline | 4–6 weeks | Customer cohort and pilot customers, primary legal texts (L-27), applicability and source register, closure plan for Appendix C, data dictionary, practitioner reviewed seed scenarios, hosting and data protection decisions, architecture decisions, UX flows, backlog, budget for practitioner and counsel. | Owner accepts scope and cohort; reviewers contracted; every Appendix C item has an owner and date; activation blocks defined. |
| 1 Platform and people foundation | 6–8 weeks | Tenancy, identity and MFA, roles and permission matrix (Section 24), audit trail and activity log screen (Section 25), organisation, employee history, calendars and holidays (Section 21), private documents (Section 23), notifications, migrations, CI/CD, synthetic fixtures. | Cross tenant and field access tests pass; audit integrity check passes; backup restore demonstrated; import reconciliation passes. |
| 2 Time, leave and people services | 6–8 weeks | Attendance imports and corrections, leave ledger with holiday rules, approvals, employee portal (web and PWA), Bangla and English notifications, service desk, onboarding and offboarding checklists, basic reports and report catalogue. | Concurrent leave and retroactive holiday change tests pass; balances reconcile; no sensitive data in notifications. |
| 3 Payroll and tax kernel | 10–14 weeks | Components, snapshots, deterministic engine, a Bangladesh pack that is separately verified from authoritative texts and approved (Appendix B holds unverified candidates only), bonuses and arrears, withholding, subledger, Bangla and English payslips, PF, gratuity and WPPF required by pilots, statutory outputs, payment calendar with bank days. | Independent golden cases pass exactly; posted results immutable and reproducible; no unsupported scenario active; payroll and tax ledgers reconcile; practitioner sign off. |
| 4 Controlled payroll pilot | 8–12 weeks elapsed | Bank instructions, payment and remittance reconciliation, statutory exports, year end and amendments, migration, at least two parallel monthly cycles and a simulated year end. | All differences resolved; practitioner, payroll and security signoffs; recovery and retry tests pass. First live payroll only after this gate. |
| 5 Performance and appraisal | 6–8 weeks | Objectives, review cycles, calibration, appeals, appraisal budgets and compensation handoff. Advanced engagement surveys, succession and learning follow in R2. | Confidentiality and role visibility pass; compensation changes require approval with correct effective dates. May run alongside Phase 4. |
| 6 Commercial scale and complete scope | 6–10 weeks | Plans and billing, report builder and scheduled reports (Section 26), public API and webhooks, SSO and SCIM, sandbox tenants, privacy tooling (Section 28), load and security testing, support tooling, runbooks, customer exports. | Scale targets met or limits documented; all R1 commitments accepted; unresolved R2 capabilities are clearly excluded from launch promises; independent security review issues resolved. |
| 7 Expanded legal regimes and capabilities | Ongoing | Reviewed EPZ, garments and export sector, public, special sector and nonresident packs, richer benefits, advanced integrations. | Each regime has its own approved scenario suite and rollout gate. |

Calendar constraints: schedule the pilot parallel runs so that at least one includes a festival bonus month. Do not plan the first live payroll in the month containing Eid or around the 30 June year end. Prepare and simulate annual candidates early, but activate only enacted, verified rules. If final law arrives too late for a full prior parallel cycle, require an accelerated independent regression and payroll-specific simulation, impact review and dual release approval; do not activate a proposal or fabricate a prior validation cycle.

Phases 1–2 may be offered for HR operations before live payroll. Phases 3–4 produce a controlled payroll release for approved cohorts. Completion of Phase 6 constitutes the initial commercial core product (R1). Appendix F assigns advanced functions to R2; they remain roadmap requirements rather than initial commercial commitments. Any cohort-specific legal obligation overrides an R2 deferral. A customer requiring an unimplemented obligation must wait for that capability or use a separately approved supported workflow; scheduling it later does not waive the obligation.

## 18 Acceptance tests and definition of done

### 18.1 Critical acceptance scenarios

| Test ID | Scenario and expected behavior |
|---|---|
| AC-01 | Employee from tenant A requests tenant B’s payslip/API/export/object URL: denied with no data disclosure. |
| AC-02 | Manager views a team member: only authorized fields appear; confidential tax evidence and unreleased peer responses remain inaccessible. |
| AC-03 | Two leave requests compete for the last day: only one can reserve/consume it under the configured policy. |
| AC-04 | Salary changes midmonth: approved proration and tax projection match a reviewed expected calculation. |
| AC-05 | Festival bonus paid separately: annual projection and total withholding reconcile without duplicate exemptions. |
| AC-06 | Eligible category has overlapping age/disability relief: approved precedence applies; missing evidence creates the expected exception. |
| AC-07 | Employee joins with prior income/tax evidence: annual figures reconcile and no credit is counted twice. |
| AC-08 | Employee declares personal AIT: it remains separate unless the approved withholding rule permits its use. |
| AC-09 | Posted payroll is rerun after law/configuration changes: original result is reproducible; new law creates only an explicit new revision/adjustment where allowed. |
| AC-10 | Queue redelivers posting/payment job: no second posting or duplicate payable is created. |
| AC-11 | Bank accepts some employees and rejects others: accepted amounts remain paid; only rejected payables are retried. |
| AC-12 | Payroll deducted tax but no challan exists: report shows payable/overdue; never reports it as deposited. |
| AC-13 | Overwithholding appears on final pay: no unauthorized refund or negative government remittance is generated. |
| AC-14 | Employee leaves or dies midperiod: reviewed final settlement, nominee process and tax documents reconcile. |
| AC-15 | Legal pack lacks a required benefit treatment: affected calculation is blocked with a clear owner and evidence request. |
| AC-16 | Appraisal is approved after payroll cutoff: future compensation or arrears are generated through approval; old payslip remains unchanged. |
| AC-17 | Year end opens a new assessment year: correct pack is selected and prior year certificates remain reproducible. |
| AC-18 | A backdated classification correction is approved: affected periods are identified and linked adjustments preserve original history. |
| AC-19 | Database/worker crashes during posting: retry leaves a complete balanced run or no posting, never a partial run. |
| AC-20 | Restore production like encrypted backup: balances, documents, identities and audit links reconcile within recovery targets. |

### 18.2 Test strategy

- Unit tests for financial, legal, leave and approval logic, including threshold boundaries and invalid input.
- Practitioner approved golden fixtures with exact inputs, legal references, expected intermediate values, totals and rounding. Synthetic sample rates must be visibly marked TEST ONLY and impossible to activate in production.
- Property tests for deterministic replay, no duplicate credits, balanced ledgers and conservation of allocation totals, subject to explicit rounding rules.
- Database/integration tests for concurrency, tenant isolation, transactions, migrations, queues and failure recovery.
- End to end tests for onboarding, payroll approval/payment, remittance, final settlement and employee self service.
- Load, dependency, authorization and privacy checks using synthetic data. Independent security assessment before commercial payroll launch.
- At least two parallel payroll cycles plus bonus, final settlement and simulated year end comparisons with signed explanations for every difference.

A feature is done only when its requirement IDs are implemented, permissions enforced, failure paths handled, relevant tests passed, migrations reviewed, audit/reporting behavior documented and operational notes updated. Legal features additionally need source mapping and independent expected result approval. Code coverage percentage alone is insufficient.

## 19 Claude and Codex development instructions

1. Read this specification and repository instructions before editing. Use Appendix F as the starting traceability matrix; assign named owners, module, issue, acceptance specification and actual implementation status. Preserve its release boundaries and F.1 subfeature splits.
2. Start with Phase 0 outputs and a small executable vertical slice: tenant → employee → salary snapshot → synthetic calculation → draft payslip. Keep production payroll disabled until approved legal packs and release gates are complete.
3. Implement one bounded feature at a time. Before coding, state affected requirements, contracts, migrations, permissions and meaningful acceptance checks. Do not generate every module in one prompt.
4. Keep domain logic in its module. Use typed inputs/outputs, explicit errors and stable reason codes. Never put statutory constants in UI components or copy calculation logic between reports and payroll.
5. Never invent Bangladesh rates, benefits, dates, exemptions or legal interpretations. Missing information creates an issue and a blocked configuration path. Continue work on independent software capabilities.
6. Never use an LLM response as the production tax calculation. Explanations must be rendered from structured calculation traces and reviewed source references.
7. Use synthetic fixtures; never include real employee salary, bank or identity data in commits, prompts, logs or screenshots used for development.
8. Write tests appropriate to the risk. All tax/payroll, tenant boundaries, approval transitions and posting/retry logic require meaningful tests. Do not write tests that only assert hardcoded mock outputs.
9. Include migration/rollback or forward recovery instructions and update API contracts/documentation with changes. Run the relevant checks and report actual results.
10. Before marking a phase complete, demonstrate its exit gate and list unresolved requirements. Do not describe stub integrations, hardcoded reports or unreviewed legal rules as finished.
11. Do not silently change technology, legal applicability, financial invariants or data model ownership. Record material decisions in an architecture decision record and obtain the relevant project review.
12. Maintain secure configuration, lockfiles, reproducible builds, secret scanning and CI. Do not introduce dependencies without checking current official documentation and compatibility.

### 19.1 Required repository documentation

- README with setup, supported environments and test commands.
- Architecture and data model documentation with module ownership.
- Requirement traceability and supported/unsupported scenario matrices.
- Legal source register, rule pack schema, approval records and test fixture guide.
- API contracts, job/event contracts and integration format versions.
- Runbooks for payroll failure, payment duplication prevention, tax correction, source changes, incident response, backup/restore and tenant offboarding.
- Release checklist, migration instructions, changelog and known limitations.

### 19.2 Reusable implementation prompt

```text
Implement only [requirement IDs / feature] from PeopleLedger_Product_Requirements_v3.1_Final.md.
Read the repository instructions, architecture decisions and relevant module contracts first.
State the data changes, authorization rules, financial/legal invariants and acceptance checks.
Use approved legal packs only; do not infer or invent statutory parameters.
If a required legal fact is unresolved, add a typed blocking exception and issue while continuing independent work.
Implement the bounded feature, migrations, audit events and meaningful tests.
Run the relevant checks and report changed behavior, actual test results and unresolved dependencies.
Do not mark other modules or the phase complete without satisfying their release gates.
```

## 20 Production readiness and remaining determinations

The product owner must assign decision owners during Phase 0 for the initial customer cohort and legal regime, tax/labour reviewers, cloud region and privacy obligations, calculation hardware budget, email provider, bank formats, statutory forms, retention schedules and support coverage. These are implementation dependencies; they do not require reopening the product scope.

Production payroll must remain disabled for an entity until its applicability register is complete, legal packs approved, migration balances reconciled, mandatory benefits/forms available, maker/checker roles assigned, backup recovery tested and parallel payroll accepted. Missing compliance functionality cannot be dismissed as a later enhancement for an employer to whom it already applies.

PeopleLedger may be described as supporting Bangladesh HR, payroll and tax for its published approved regimes and scenarios. An unqualified promise of automatic compliance for every employee and every law must not replace the supported scenario register, practitioner validation and ongoing legal maintenance process.

## 21 Calendars, holidays and working time

This section adds the calendar configuration that attendance, leave, payroll cut off, bank payment and statutory deadlines all depend on. Holiday dates, weekly holiday rules and entitlement counts are data in the legal or policy pack; none may be coded in the application (LAW-01).

### 21.1 Calendar model

- CAL-01: Maintain separate calendar types: (a) statutory weekly holiday, (b) government public and festival holidays, (c) bank holidays and bank closing days, (d) employer or entity holidays, (e) location or branch holidays, (f) shift and roster calendars, (g) payroll calendar (cut off, approval, payment, deposit dates), (h) statutory deadline calendar, (i) company event calendar. Each is effective dated, versioned, owned and auditable.
- CAL-02: A holiday record holds name in English and Bangla, date or date range, calendar type, source reference (gazette, circular or policy), religion or community tag where relevant, applicability scope (tenant, legal entity, location, employee group), paid status, work-on-holiday rule, status (`proposed`, `confirmed`, `withdrawn`) and the user who confirmed it.
- CAL-03: Resolve the working day for an employee by precedence: individual roster override, shift calendar, location calendar, legal entity calendar, tenant calendar, platform legal pack calendar. Show the winning source on any date.
- CAL-04: Support the Gregorian, Bangla (revised) and Hijri calendars for display and entry. Hijri based dates are provisional until confirmed because moon sighting can move them by a day. Provide a one-click "shift this holiday" operation that lists every affected leave request, roster, payroll cut off and payment date before commit.
- CAL-05: Support the weekly holiday, rest day and half day patterns that differ by establishment type (for example factory, shop or commercial establishment, other). The applicable pattern comes from the legal pack, with an employer policy allowed to be more generous. Friday as the default weekly holiday is a pack default, not a constant. Support a second weekly off day and alternate Saturdays by policy.
- CAL-06: Support bridge days, government announced extra holidays, holiday swaps and a made-up working day. A holiday announced or changed after attendance or leave exists must trigger an impact report, never silent recalculation of posted payroll (LEV-05).
- CAL-07: Maintain a platform curated annual calendar of government public holidays and festival holidays as a draft pack each year. Tenants subscribe to it, review the delta and publish their own calendar. The platform may not auto-publish a moon dependent date.
- CAL-08: Provide the list of festival holidays required by the Labour Act for the establishment type, with a rule for paid festival holidays, substitution when a festival falls on the weekly holiday, and work on a festival holiday (substitute holiday and extra pay as the rules require). The count and treatment are reviewed pack parameters (open item L-08, Appendix C).
- CAL-09: Provide optional or floating holidays by religion or community (for example, employees of different faiths may choose from a configured list), with annual quota, request and approval workflow.
- CAL-10: Provide a team calendar showing approved leave, holidays, birthdays, work anniversaries, joinings, probation ends and company events, honouring visibility settings and without revealing leave type or medical reason to unauthorized viewers.
- CAL-11: Export or subscribe to an iCalendar feed for the personal and team calendar with a revocable token. Never include sensitive leave reasons.
- CAL-12: Show the holiday calendar to every employee in the portal, in Bangla or English, with the next holiday and any pending change notice.

### 21.2 Bank holidays, bank closing days and payment dates

- CAL-13: Maintain a bank business day calendar, separate from the public holiday calendar, covering bank weekly closures, bank holidays announced by the central bank, and bank closing days. Each is effective dated with source.
- CAL-14: A payroll calendar must derive its payment value date, bank file submission date and last safe approval date from the bank business day calendar for the paying bank and payment channel (for example BEFTN, RTGS, MFS or cheque), using a configured cut off time and timezone Asia/Dhaka.
- CAL-15: When the planned salary date is not a bank business day, apply the tenant rule (pay on the previous business day, pay on the next business day, or manual) and show the choice during pay run preparation. Employer policy and any statutory salary payment deadline must be checked together; if they conflict, require a corrected compliant schedule. If a deadline has already been missed, record the breach, escalate and process the overdue obligation through authorized remediation without falsely marking it compliant. No reason or override waives a statutory obligation (Appendix C item L-11).
- CAL-16: Roll a statutory deadline (tax deposit, return, certificate, fund remittance) to the next working day only if the applicable rule says so; store the rule used and show both the nominal and the effective due date. Never assume rollover. Open item L-06 tracks the Bangladesh position.
- CAL-17: Warn when a payroll cut off, approval or payment falls within a holiday cluster (for example around Eid) and propose an earlier schedule; support early salary and festival bonus payment before a holiday cluster.
- CAL-18: Handle the annual bank closing around 30 June to 1 July when tax deposits, fund remittances and year end cut offs interact. The calendar must carry the correct bank closing day and the statutory income year end (ORG-04) without conflating them.

### 21.3 Working time configuration

- CAL-19: Configure standard working hours, breaks, daily and weekly limits, grace periods, late marks policy, half day rules, flexible hours, remote or hybrid days, shift patterns and rosters, with legal limits (for example overtime and daily hours caps) coming from the pack and warning on breach.
- CAL-20: Handle Ramadan or other seasonal working hour changes as an effective dated working pattern with an affected employee group.
- CAL-21: Provide shift rostering for rotating and night shifts, shift swap requests, minimum rest, women night work conditions where the law imposes them, and roster publication with employee acknowledgement.
- CAL-22: Compute leave day counts, public holiday exclusion, sandwich rule (holidays between leave days) and weekend inclusion strictly from the resolved calendar and the leave type rule, with a worked preview before submission.

## 22 People services and HR practice

This section lists everyday HR practice that a world class HRIS covers beyond core records and payroll. Each item must reuse the common workflow, notification, document and audit services.

### 22.1 Employee experience and directory

- HRP-01: Searchable people directory and interactive org chart (reporting line, matrix line, dotted line), with per field visibility so personal phone, birth date and address are hidden unless the employee shares them.
- HRP-02: Employee profile with photo, skills, languages, certifications, education, previous experience, emergency contacts and social links, with approval for fields that affect payroll or compliance.
- HRP-03: Company announcements, policy and handbook publication, acknowledgement tracking, read receipts, audience targeting by entity, location, grade or group, and expiry.
- HRP-04: Birthday, work anniversary and joiner announcements with an opt out; culturally appropriate greetings for festivals through the holiday calendar.
- HRP-05: Pulse and engagement surveys, anonymous feedback with minimum group size for reporting, eNPS, action tracking and results visibility by role.
- HRP-06: Recognition and kudos feed with optional rewards budget routed through payroll as an approved earning.
- HRP-07: Employee welfare programs, such as medical insurance enrolment, group life, welfare fund contributions and canteen or transport subsidies, with eligibility rules and enrolment windows.

### 22.2 Service desk and cases

- HRP-08: HR help desk where an employee raises a request or question, assigned by category, with SLA timers, internal notes, confidentiality levels, knowledge base suggestions and satisfaction rating.
- HRP-09: Case management for grievance, harassment complaint, whistleblowing, disciplinary action, show cause notice, investigation and appeal. Cases are restricted to named handlers, support anonymous reporting where chosen, preserve evidence, enforce statutory timelines, and are excluded from ordinary reports and from the employee's general profile.
- HRP-10: Disciplinary and termination procedures must follow the applicable procedure in the legal pack (notice, charge, hearing, committee composition, punishment grade, appeal). The system guides the steps and timers; it does not decide guilt or legal outcome.
- HRP-11: Workplace safety and incident reporting for injury, accident and compensation claims, with statutory report templates and links to leave and payroll adjustments.

### 22.3 Lifecycle practices

- HRP-12: Recruitment handoff: accept an approved offer, requisition id, candidate documents and background check status as the start of onboarding. A full applicant tracking system is outside the first release (Section 1.2), but a lightweight requisition and offer approval flow is included.
- HRP-13: Offer letter, appointment letter, confirmation, increment, promotion, transfer, warning, suspension, resignation acceptance, termination, experience, salary certificate, no objection and service certificate letter templates in English and Bangla with merge fields, approvals, e-signature and numbering series.
- HRP-14: Configurable onboarding and offboarding checklists by role and location with tasks for HR, IT, admin, finance and manager, due dates, reminders and escalation. Include new joiner buddy and day one portal access.
- HRP-15: Probation management: probation end alerts, review forms, extension, confirmation approval, and a block that prevents silent expiry of probation or contract.
- HRP-16: Contract and fixed term management: expiry alerts, renewal workflow, and warnings where repeated renewal may change legal worker status (practitioner reviewed rule).
- HRP-17: Notice period, resignation, clearance, exit interview, final settlement trigger, experience letter release conditions and rehire eligibility flag.
- HRP-18: Employee transfers and secondments between entities with continuity of service, leave and fund treatment decided by explicit policy.
- HRP-19: Talent practices: succession planning, skills matrix, training catalogue, training attendance and cost, mandatory training expiry, bond or service agreement tracking with recovery rules and legal review.

### 22.4 Employee money and assets

- HRP-20: Expense claims and travel: policy limits, receipts, per diem, multi currency capture, approval chain, accounting export, and reimbursement through payroll or a separate payment. Reimbursements are not salary unless the pack says so.
- HRP-21: Salary advance, staff loans, interest free or concessional loans, loan schedule, recovery, top up, waiver and perquisite assessment. Link to the tax rule for concessional loans where the pack requires it.
- HRP-22: Asset management: laptop, phone, vehicle, ID card, access card and uniform assignment, acknowledgement, return at exit, damage recovery with approval, and link to final settlement.
- HRP-23: Company vehicle, fuel and driver allowance and accommodation provision tracked as benefits with valuation for tax (BEN rules, perquisite open item).
- HRP-24: Provident fund loans and withdrawals, gratuity payment and welfare fund claims as workflows with documents and approvals.

### 22.5 Time off practice (additions to LEV)

- HRP-25: Time off types to be available as templates: casual, sick, annual or earned, maternity, paternity (policy), compensatory off for holiday work, festival leave, unpaid leave, hajj or religious pilgrimage leave by policy, study leave, bereavement, marriage, quarantine and injury leave. Statutory types are locked to pack minimums; employer types are configurable.
- HRP-26: Leave policies assigned by entity, grade, location, employment type, gender where the law differentiates, and tenure; changes are effective dated and never rewrite granted balances silently.
- HRP-27: Sick leave medical certificate rules, extended leave, return to work clearance and accommodation records, with medical content visible only to authorized health handlers.
- HRP-28: Leave encashment on resignation, retirement or year end following the pack rule and the tax treatment, with an employee preview.
- HRP-29: Compensatory off and holiday work: record work on weekly holiday or public holiday, choose pay or compensatory leave as the rule allows, and expire compensatory balances by policy.
- HRP-30: Absence management: unauthorized absence tracking, absence without leave notice process, deductions only through approved rules, and automatic reminders before any statutory abandonment period is reached.

## 23 Personal and private document management

Employee documents are among the most sensitive data in the product. This section defines document storage, access, generation and retention.

### 23.1 Document model

- DOC-01: Store every document as an immutable versioned file with metadata: owner person, employment, document type, category, title, effective date, issue date, expiry date, language, source (employee upload, HR upload, system generated, imported), status, confidentiality class, retention class, checksum, uploader and review state.
- DOC-02: Use confidentiality classes with distinct default access: Public to company, Employee visible, Manager visible, HR restricted, Payroll and finance restricted, Legal restricted, Medical restricted, Case restricted. Class changes are audited and require authority.
- DOC-03: Provide a controlled document type catalogue per tenant with required, optional and conditional documents per employment type (for example national ID, birth certificate, photograph, educational certificates, experience letters, TIN certificate, passport, work permit, bank account proof, nominee form, medical certificate, signed contract, NDA, police verification where used, reference check), with mandatory fields, accepted formats and expiry reminders.
- DOC-04: Employee personal file (digital personnel file) is a single organized view per person and employment showing required document completeness, expiring documents, pending review and access history.
- DOC-05: Employees can upload their own documents from web or mobile, view documents shared with them, and request correction. HR review states are `pending`, `accepted`, `rejected with reason` and `expired`. An unreviewed upload cannot be used as tax or payroll evidence.
- DOC-06: Store files in private tenant segregated storage with server side encryption, tenant scoped keys where feasible, malware scanning, file type and size validation, and no public URLs. Downloads use short lived authenticated links bound to the user and tenant.
- DOC-07: Viewing a sensitive document (ID, medical, bank, tax, disciplinary, legal) writes an access log entry. Provide an optional watermark with viewer name and time on previews and downloads, and a setting to disable download for high sensitivity classes.
- DOC-08: Support bulk upload with naming or index file matching, duplicate detection by checksum, an exception queue and no cross person misfiling.
- DOC-09: Provide full text search over document metadata and, for text extractable files, content. Content search respects permission and confidentiality class at query time, and sensitive classes are excluded from search unless the searcher is authorized.
- DOC-10: Optional OCR and data extraction may suggest field values (for example from an identity document) but the suggested values require human confirmation and must not overwrite approved data.
- DOC-11: Accept images and PDF as a minimum; provide in browser preview, rotation, page reordering and redaction of an uploaded copy without altering the original version.

### 23.2 Generation, signature and acknowledgement

- DOC-12: Generate letters and certificates from versioned templates in English and Bangla with merge fields, conditional blocks, tenant branding, signatory block and a serial number. Preview before issue; issued documents are immutable and any reissue creates a new version with reason.
- DOC-13: Support electronic signature and acknowledgement of documents. Record signer identity, authentication strength, timestamp, IP address, document checksum and consent. A Phase 0 decision records which Bangladesh signature type is legally sufficient for each document type; where a wet signature is required, record the scanned original and location.
- DOC-14: Provide approval workflow for sensitive generated documents (for example salary certificate, experience letter) with release rules and optional bank format.
- DOC-15: Provide a document request flow where an employee requests a letter (salary certificate, employment verification, NOC), HR approves, the system generates it, and the employee downloads it. Include verification by a public QR or code that confirms authenticity without exposing salary.
- DOC-16: Track policy acknowledgements and training certificates as documents linked to the same record, with re-acknowledgement on policy change.

### 23.3 Retention, holds and privacy

- DOC-17: Retention class per document type: period, trigger (end of employment, issue date, financial year end), legal basis and disposal action. Retention values come from the legal pack and the tenant policy; no single period is hardcoded (NFR-05).
- DOC-18: Legal hold prevents deletion or expiry processing for the held scope with an audit trail of who set and released it.
- DOC-19: Deleting a document means an authorized, reasoned action that removes content after the retention rule allows, leaves a tombstone with metadata and checksum, and is reflected in backups according to the documented backup expiry. The employee's own data access request can export their personal file in a standard archive.
- DOC-20: Documents of a rehired person remain under their original retention clock and confidentiality class. Documents of a terminated employee remain accessible to authorized roles only and visible to the former employee through a limited exit portal for a configured period.
- DOC-21: Prevent sensitive documents from being attached to email by default. Email notifications contain a link and a notice, never the document or its sensitive content (COM rules).
- DOC-22: Report document completeness, expired or expiring documents, pending reviews, access exceptions and storage usage, scoped by permission.
- DOC-23: Provide a customer exit export of all documents with a manifest and checksum (SAS-04).

## 24 Role management and access control

This section replaces the short role table in Section 3 with a complete, administrable access model. Section 3 remains the default role catalogue.

### 24.1 Role model

- RBAC-01: Provide system roles (those in Section 3, immutable except for tenant scoping) and tenant defined custom roles. A custom role is a named set of permissions plus a scope definition. Cloning a system role to customize it is supported; the clone records its parent.
- RBAC-02: Permissions are explicit `resource:action` pairs (for example `payroll_run:approve`, `employee_bank:read`, `report:export`). Actions include view, create, edit, delete, approve, release, export, impersonate, configure. The permission catalogue is versioned with the product and every permission has an owner, description and sensitivity level.
- RBAC-03: Scope dimensions on a role assignment: tenant, legal entity, location, department, cost centre, pay group, employee group, reporting line (direct, indirect, matrix) and self. Provide computed scopes such as "all reports below me" and "employees in my location".
- RBAC-04: Field level permissions on sensitive fields (salary, bank account, national ID, tax category, medical, disciplinary, bonus, performance rating, personal contact). Each field has hide, mask (last digits), read and write states per role. Masked values are not retrievable through API, export, search, notification or cache.
- RBAC-05: A user may hold several roles and several role assignments with different scopes and validity periods. Effective permissions are the union of grants, then reduced by explicit denies and by separation of duty constraints. Show a permission explainer ("why can this user see X?").
- RBAC-06: Separation of duty rules are configurable and enforced at assignment time and at action time: for example the same user cannot both prepare and approve a payroll, change a bank account and release the payment, or hold HR administrator and auditor roles. Violations are blocked. Only noncritical role-combination restrictions may have documented, expiring exceptions with independent approval. The transaction-level self-approval prohibitions in SEC-02 are non-overridable. A permitted role combination never authorizes self-approval of an individual transaction.
- RBAC-07: Role assignment requires approval for sensitive roles (payroll, finance, tax, administrator, auditor), has a start and end date, a reason and a named approver, and notifies the user. Self assignment and self approval are blocked.
- RBAC-08: Delegation and acting arrangements (SEC-03) appear in the same model with their own scope and expiry. A delegate cannot exceed the delegator's permissions or delegate onward unless explicitly allowed.
- RBAC-09: Break glass and emergency access follow SEC-04 and appear in the access log with justification, approver, time box and automatic review task.
- RBAC-10: Time limited access grants (for example an external auditor or consultant for 30 days) with automatic expiry, mandatory MFA, IP allow list option and read only enforcement.
- RBAC-11: Periodic access review: scheduled campaigns where owners confirm or revoke each user's roles; unreviewed assignments escalate and can be auto suspended. Export the review evidence.
- RBAC-12: Role simulation: an administrator can preview the product as a role or as a specific user without gaining that user's data access beyond what simulation permits (view only, masked sensitive fields, banner shown, logged).
- RBAC-13: Impersonation by support staff is off by default, requires tenant consent, a ticket reference, a time box and read only mode, shows a persistent banner to the impersonator, notifies tenant admins and is fully logged. Impersonation can never approve, release payment, change bank data or change roles.
- RBAC-14: Role administration screens: role list, permission matrix (resources by actions with scope), user assignments, effective access report, permissions diff between two roles, role change history and import or export of a role definition.
- RBAC-15: The platform role set is separate from tenant roles. Platform operator staff access to tenant data requires tenant consent and the same logging. Platform and tenant authorization decisions are never mixed in one code path.
- RBAC-16: Every authorization is enforced server side at the API, query and file layer. UI hiding is cosmetic. Provide automated tests that iterate the permission catalogue against every endpoint (broken object level and field level authorization).
- RBAC-17: Offboarding or role change removes access immediately, revokes sessions and tokens, reassigns pending approvals and flags work items owned by the user.

### 24.2 Identity and authentication

- IAM-01: Email and password with breach password check, MFA (TOTP and WebAuthn passkeys at minimum; SMS only as a last resort fallback), recovery codes and trusted device policy.
- IAM-02: Tenant security policy: password rules, MFA required by role or all users, session timeout, concurrent session limits, IP allow lists, allowed email domains, invite expiry and lockout.
- IAM-03: SSO using SAML 2.0 and OIDC with just in time provisioning and group to role mapping; SCIM 2.0 user provisioning and deprovisioning. This may follow the initial release but identity, user and employee entities must be designed for additive federation and provisioning changes without rewriting payroll history; reviewed schema migrations may still be required (SEC-05).
- IAM-04: Link user account to employee record explicitly; one user can belong to several tenants with distinct sessions and no cross tenant data visibility. Users without an employee record (auditor, consultant) are supported.
- IAM-05: Session management screen: list active sessions and devices, revoke, show last login and unusual login alerts.
- IAM-06: API credentials: personal access tokens and service accounts with scoped permissions, expiry, rotation, last used timestamp and revocation. Secrets display once and are stored hashed.

## 25 Audit trail and activity logs

Audit history in NFR-03 is extended into a user facing, searchable and exportable capability.

### 25.1 What is recorded

- AUD-01: Record at minimum: authentication events (login, failure, MFA change, password change, SSO, session revocation), authorization changes (role, permission, delegation, scope), data create, update and delete with before and after (field level diff for ordinary data; reference or hash for sensitive values), approvals and rejections, exports and downloads, document views, report runs, payroll lifecycle events, rule pack changes, configuration changes, integration and API calls, impersonation, emergency access, and system generated actions (jobs, imports, scheduled sends).
- AUD-02: Each entry includes: unique id, timestamp UTC, tenant, legal entity where relevant, actor (user, service account, system job, support staff) and acting-as user for delegation or impersonation, action, resource type and id, result (success, denied, failed), reason or comment where required, source (web, API, mobile, integration, job), IP address, user agent or device, request and correlation id, and a pointer to before and after state.
- AUD-03: Sensitive values (salary, bank, national ID, tax category, medical) are stored in audit entries as references, masked values or encrypted payloads readable only to roles with the same access to that field. Secrets and credentials are never logged.
- AUD-04: Separate audit categories with their own retention and access: security, data change, financial and payroll, privacy (reads of sensitive data), configuration and legal pack, communication delivery, integration and system.
- AUD-05: Read logging for sensitive data is configurable by field class and aggregated to avoid noise (for example one entry per profile view session), but export and bulk read always log fully.

### 25.2 Integrity, retention and access

- AUD-06: The audit store is append only. Application roles including tenant owners cannot edit or delete entries. Chain entries with a hash per tenant and per period and anchor the chain periodically in a separate write protected store so that tampering is detectable. Provide an integrity verification report.
- AUD-07: Retention per category is configurable within legal minimums from the pack and contract, with legal hold support. Archive older entries to cheaper storage while remaining searchable through a slower path. Deletion at the end of retention is itself logged.
- AUD-08: Audit data is isolated per tenant; a failure to write a required audit entry for a financial or security action aborts that action (no unlogged sensitive change).
- AUD-09: Clock integrity: all servers use trusted time; entries expose both event time and recorded time.

### 25.3 User interface and use

- AUD-10: Activity log screen for authorized roles with filters (actor, action, resource, entity, employee, date range, result, source, category), free text search, saved filters, sorting, pagination to large volumes, and a detail drawer with the before and after diff and related events by correlation id.
- AUD-11: Per record "History" tab on employee, compensation, leave request, payroll run, rule pack, document and role records, honouring field permissions.
- AUD-12: Employee facing "Activity on my data" view showing who accessed or changed their sensitive personal data, for privacy transparency, with HR configurable detail.
- AUD-13: Export audit results to CSV and signed PDF with filters recorded, within permission and with the export itself logged. Large exports are asynchronous (REP-06).
- AUD-14: Provide an audit streaming option (SIEM export through signed webhook, syslog or cloud storage) for enterprise customers.
- AUD-15: Real time alerts on configured events: failed login bursts, new device login for privileged user, role escalation, bulk export, payroll approval by unusual actor, bank change near payment date, impersonation, rule pack activation, audit integrity failure, after hours access.
- AUD-16: Provide a customer auditor workspace with read only access to evidence packs: payroll approval chain, rule pack version used, calculation explanation, reconciliation, access review records and change logs, exportable as a signed archive.
- AUD-17: Separate the operational application log (diagnostic, short retention, no personal data) from the audit trail (business evidence). Support staff cannot use diagnostic tools to bypass audit.

## 26 Reporting, analytics and data access platform

Section 12 lists required reports. This section defines the reporting platform that delivers them.

### 26.1 Report catalogue and execution

- RPT-01: Maintain a report catalogue with id, name, category, description, owner, data sources, required permission, parameter definitions, output formats, refresh type (live, snapshot), data freshness, and version. Standard reports are product owned and versioned; changes to a statutory report template are reviewed.
- RPT-02: Categories at minimum: Workforce, Joiners and leavers, Attendance, Leave and holidays, Calendar and roster, Documents and compliance, Performance and appraisal, Payroll, Tax and withholding, Statutory and fund, Costing and budget, Audit and security, Communications, Platform usage.
- RPT-03: Every report: parameter form with saved defaults, preview, pagination, sorting, filtering, column chooser, grouping and subtotals, drill down to source records, and consistent header (entity, period, filters, status, as of time, generated by, rule and engine version) per REP-05.
- RPT-04: Output formats: on screen, CSV, XLSX, PDF with letterhead and Bangla font support, and JSON via API. Statutory forms are generated from certified templates; ordinary reports use configurable layouts.
- RPT-05: Run options: on demand, scheduled (daily, weekly, monthly, payroll event, deadline based), and event triggered. Delivery by in-app inbox, secure download link or email link; sensitive reports are never attached to email.
- RPT-06: Scheduled report definition holds recipients, filters frozen or relative (for example "last month"), format, time zone, failure notification and owner. Before generation, delivery and download, re-evaluate each recipient’s permitted rows and fields as well as the owner’s current rights. Produce separate recipient artifacts where permissions differ. A recipient who loses access stops receiving the report, and the owner is told; previously issued links are revoked where necessary.
- RPT-07: All reports honour row, field and scope permissions evaluated at run time for the viewer; scheduled reports use the intersection of schedule-owner and recipient permissions, never the owner’s broader access alone. Shared saved reports show each viewer only their permitted rows and fields; static exports must not be shared across differing scopes. Revalidate download access and invalidate artifacts affected by a permission change.
- RPT-08: Every report run and export is logged with parameters and row count (AUD-01). Add watermarking and an export reason prompt for sensitive classes.

### 26.2 Self service analysis

- RPT-09: Custom report builder over a governed semantic layer (curated datasets such as Employee, Employment, Leave, Attendance, Payroll Results, Tax, Documents, Performance) with typed fields, joins predefined by the product, calculated fields through the restricted formula language, filters, grouping, pivot, charts and conditional formatting. Users cannot write raw SQL on production tables.
- RPT-10: Saved views, folders, favourites, sharing with users, roles or groups, and ownership transfer. Sharing never grants access to data the recipient could not otherwise see.
- RPT-11: Dashboards with configurable widgets, filters, period comparison, targets and drill down, separately for HR, payroll, finance, manager and executive personas. Provide a manager dashboard limited to reports in scope.
- RPT-12: Headcount, diversity, attrition, absenteeism, overtime, leave liability, payroll cost, bonus cost, cost per head, offer to join, time to fill (when requisition exists), probation outcome, appraisal distribution, training hours and document compliance metrics have definitions documented in a metric dictionary and the same definition is used everywhere.
- RPT-13: Privacy safeguards for small groups: suppress or merge results below a configured minimum group size for sensitive dimensions (gender, disability, ethnicity, performance) to avoid re identification.
- RPT-14: Data access layer for analytics: read only API and optional export to the customer's warehouse (secured, incremental, scoped), with the same permission model and a data dictionary. Heavy analytical queries run against a replica or warehouse and never degrade payroll.
- RPT-15: Time travel: any report can be run "as of" a past date for effective dated data, and compare two dates. Payroll and tax reports can be run on posted results, projections or both, labelled clearly.
- RPT-16: Report performance targets: standard report p95 below 5 seconds for 10,000 employees, large exports asynchronous with progress and cancellation; a report that would exceed limits asks for narrower filters.
- RPT-17: Reconciliation reports compare payroll to the general ledger export, bank file to payroll payable, withholding to deposits, leave ledger to balances, headcount to master list; any variance is listed with a drill down.

### 26.3 Statutory and regulatory outputs

- RPT-18: Maintain generators for the regulatory outputs the active pack requires (for example employer annual salary and withholding statements, employee tax certificate, fund returns, WPPF distribution schedule, statutory registers, labour inspection records, minimum wage compliance report, overtime register, festival bonus statement). Each carries template version, source reference and an approval status; a template that is not approved is watermarked "draft".
- RPT-19: Bangla and English outputs for statutory forms, with Bangla numerals as a user option on prints and a lakh and crore number format switch. Currency is shown as BDT with the grouping style chosen by the viewer.
- RPT-20: Keep a regulatory deliverable calendar tracking each required filing, deposit, certificate or register, due date, owner, status, evidence and effective due date after holiday rules (CAL-16).

## 27 Platform capabilities of a world class SaaS product

### 27.1 Tenant administration and onboarding

- PLT-01: Self service tenant setup wizard: organisation, legal entities, calendars, working patterns, leave policies, grades, pay groups, roles, imports and payroll readiness checklist with percentage complete and blockers.
- PLT-02: Guided data migration with templates, mapping, validation, dry run, reconciliation and rollback of an unposted batch (INT-01, INT-02). Provide sample data sandbox and a test tenant mode clearly separated from production.
- PLT-03: Environments for customers: a sandbox tenant refreshed from masked production data for training and parallel runs, with outbound email and payments disabled.
- PLT-04: Settings centre with search, change history, effective dating, approval for sensitive settings, import and export of configuration, and a comparison between two tenants' configuration for implementers (never exposing data).
- PLT-05: Feature flags and gradual rollout per tenant, with plan gating, early access program and rollback; flags are audited and cannot disable security, audit or legal compliance controls.
- PLT-06: Branding: logo, colours, email sender name and domain verification (SPF, DKIM, DMARC), custom sub domain, and employee portal welcome content.

### 27.2 Notifications and communication platform

- PLT-07: Notification centre with in-app inbox, email, push (PWA and mobile), and optional SMS and WhatsApp business messages if approved; per user preferences by category with mandatory legal and security notices that cannot be disabled; quiet hours and digest options.
- PLT-08: Template management for notifications and emails in English and Bangla with approval, preview, test send, merge field validation, versioning, unsubscribe where applicable, and a rule that sensitive values never appear in the message body or subject.
- PLT-09: Delivery tracking: queued, sent, delivered, bounced, opened where lawful, failed with reason; retry, suppression list, rate limits and per tenant sending reputation protection (COM rules).
- PLT-10: Approval via notification: approve or reject from email or mobile notification using a signed single use link that requires a fresh authentication for sensitive approvals.
- PLT-11: Reminder engine for deadlines, expiring documents, unapproved requests, probation end, contract end, birthdays, payroll cut off, statutory due dates and incomplete onboarding with escalation chain.

### 27.3 Integration and extensibility

- PLT-12: Versioned public REST API (and GraphQL optional) covering core resources with OpenAPI documentation, idempotency keys, cursor pagination, filtering, rate limits per tenant and per key, standard error model, sandbox keys, and deprecation policy with minimum notice.
- PLT-13: Webhooks for business events (employee created, leave approved, payroll posted, document expiring and others) with signed payload, retries with backoff, delivery log, replay, and subscription management (INT-05).
- PLT-14: Marketplace-ready integration catalogue: biometric attendance devices, access control, email, SMS, bank formats, accounting and ERP, identity providers, communication tools, e-signature providers, with connection health pages.
- PLT-15: Developer portal with docs, changelog, API explorer, and API usage dashboard per tenant.
- PLT-16: Custom fields, custom forms, custom workflows and simple automation rules (if event and condition then action) using the restricted formula DSL. Automations cannot change posted financial results, cannot bypass approvals and run in a sandbox with execution limits and logs.
- PLT-17: Workflow engine administration: visual approval chain builder, conditions on amount, grade, department or tenure, parallel and sequential steps, auto approve rules with limits, SLA, escalation, delegation, and versioning with in-flight request handling.

### 27.4 Billing, plans and customer success

- PLT-18: Plans and limits (employees, entities, modules, storage, API calls, report schedules), usage metering, invoices, tax invoices under Bangladesh VAT rules where applicable, manual and gateway payment, dunning, grace periods and plan change proration. Billing is separate from payroll (SAS-02). Pricing is a Phase 0 business decision.
- PLT-19: Customer health and usage analytics for the vendor (adoption, active users, failed jobs, support volume) using aggregated metadata only, never tenant HR content.
- PLT-20: In-app help centre, contextual tooltips, guided tours, release notes, "what's new", a searchable Bangla and English knowledge base, and feedback capture with screenshot consent.
- PLT-21: Support tooling: ticket link from any screen with automatically attached non-sensitive context (tenant, user role, correlation id, version), support access request flow with tenant approval, and status page with incident history, subscription and maintenance windows.
- PLT-22: Maintenance and release management: zero downtime deploys where possible, backward compatible migrations, release notes, tenant notices for changes affecting payroll, and no change to a legal pack or calculation engine inside a locked payroll period without approval.

### 27.5 Experience, language and devices

- PLT-23: Full Bangla and English user interface by R1, with mandatory payroll outputs/templates by R0, Bangla numerals option, Bangla fonts in PDFs and emails, date display in Gregorian and optionally Bangla and Hijri calendars, lakh and crore grouping, and locale aware sort and search for Bangla names. Pull the Bangla payslip and email templates into Phase 3 (Section 29).
- PLT-24: Responsive web plus installable Progressive Web App for employee self service on low end Android devices, with offline tolerant leave request drafts, push notifications, biometric unlock where supported and low bandwidth mode. Native apps are optional later.
- PLT-25: Mobile attendance options: check in and out with configurable method (geofence, selfie, QR, Wi-Fi network, device), spoof detection, fallback to manual correction workflow, and clear employee consent for location use.
- PLT-26: WCAG 2.2 AA accessibility, keyboard navigation, screen reader support, high contrast, text scaling, and accessible PDFs for payslips.
- PLT-27: Global search across employees, documents (permitted), requests, reports and settings with permission aware results and recent items.
- PLT-28: Bulk operations with preview, validation and undo window for unposted data, mass update via file, and background job monitor.
- PLT-29: Data export and portability: authorized tenant users can export datasets in open formats within their explicit row and field permissions; tenant ownership alone does not grant salary, medical or case access. Employees can export their own disclosable personal data, subject to reviewed third-party, case and legal restrictions.

### 27.6 Reliability, security assurance and operations

- PLT-30: Multi region or multi zone resilience design with documented RPO and RTO (NFR-06), automated backups, restoration drills, runbooks, dependency failure handling and capacity management.
- PLT-31: Security programme: threat model, secure SDLC, dependency and container scanning, secret scanning, static and dynamic testing, annual third party penetration test with remediation tracking, bug bounty or disclosure policy, vulnerability SLAs, WAF, DDoS protection and egress control.
- PLT-32: Compliance posture: adopt ISO 27001 style controls and prepare for SOC 2 style reporting; maintain a customer trust page with subprocessors, hosting locations, security whitepaper, and breach notification process. Certification is a commercial goal, not a claim made before it is achieved.
- PLT-33: Observability: metrics, logs, traces, synthetic checks, error budgets, per tenant dashboards for the vendor and alerting on payroll critical paths (NFR-08).
- PLT-34: Disaster recovery for payroll weeks: a payroll freeze window during which risky deployments are blocked, with an emergency manual contingency runbook using the latest valid approved snapshot and reconciled payment-attempt history. Before file generation, establish whether each payable was submitted, accepted, rejected or has an unknown outcome. Unknown outcomes require bank investigation and block automatic retry. Emergency processing preserves dual approval, stable payable identifiers and post-recovery reconciliation; a snapshot alone is insufficient payment authority.
- PLT-35: Data residency: tenant data location is declared and recorded. Phase 0 determines the hosting options and legal requirements; no promise of local hosting or cross border processing is made before that (NFR-04).

## 28 Privacy and data protection operations

- PRV-01: Maintain a record of processing activities, lawful basis or consent per purpose, data categories, recipients, retention and transfer locations. The Phase 0 legal review identifies the applicable Bangladesh data protection law and its status (open item L-23) and the design must support the stricter of customer contract or law.
- PRV-02: Consent management for optional data (photo, location tracking, biometric attendance, health information, diversity data) with versioned notice, grant, withdraw and audit.
- PRV-03: Data subject requests: access, correction, export, restriction and erasure, with workflow, identity check, SLA timer, legal retention exceptions explained to the requester and complete audit.
- PRV-04: Data classification tags across fields and documents drive masking, logging, search exclusion, export controls and retention. Classification changes are governed.
- PRV-05: Biometric and location data have special handling: separate storage, minimal retention, no use beyond declared purpose, and an explicit opt in unless the employer demonstrates a lawful alternative.
- PRV-06: Breach response: detection, triage, containment, customer notification and evidence package workflow with templates. Notification timelines come from contract and law.
- PRV-07: Anonymized and synthetic data tooling for demos, testing and analytics; production data never copies into non production without masking (NFR-12).
- PRV-08: Vendor and subprocessor register with data flows, contract status and review dates.
- PRV-09: Privacy by default settings: new tenants start with least privilege, minimal visibility of personal data in the directory and no optional tracking enabled.

## 29 Payroll compliance additions

These items are explicit because they are common sources of Bangladesh payroll error. Values live in packs; see Appendix C for verification status.

- PAY-15: Wage payment deadline: validate that the salary payment date meets the statutory deadline relative to the end of the wage period for the employee class, and the notice requirements for termination and resignation payments. Prevent scheduling that incorrectly represents a statutory breach as compliant. Record and escalate missed deadlines while allowing authorized overdue payment and remediation. Tenant policy cannot waive a mandatory deadline (CAL-15).
- PAY-16: Sector and grade minimum wage: where a wage board or notification sets a minimum for the employee's sector and grade (for example the garments sector), validate every payroll against it, including the allowances that count toward the minimum. The first cohort excludes sectors without a loaded minimum wage pack, and the tenant onboarding checklist asks for the sector.
- PAY-17: Festival bonus: configure bonus rules (entitlement, number per year, base, eligibility after service period, proration, timing relative to the festival date) from the legal or policy pack, including contractual bonus beyond statute. Calculate tax on bonus using the average rate method defined in the pack. Link payment timing to the holiday calendar (CAL-17).
- PAY-18: Workers Profit Participation Fund: assess applicability by establishment (type, capital or worker count thresholds), compute the company's allocation from net profit input supplied by finance, split between participation, welfare and workers fund per the pack, produce a worker wise distribution schedule, handle workers who leave or join, and record payments and the required deposit or filing evidence. The PeopleLedger profit input is an input to be verified, not an accounting result.
- PAY-19: Provident fund and gratuity: configure employer and employee contribution, recognition status, vesting, interest allocation, loans, withdrawals, forfeiture, transfer on rehire, and gratuity eligibility and calculation by service tiers per the active pack. Track recognised fund approval evidence because tax treatment depends on it.
- PAY-20: Overtime: apply daily and weekly caps, rate multiplier, wage base definition, rest day and holiday treatment, and exclude managerial and confidential roles per the worker status rule. Show a payroll overtime register in the statutory format.
- PAY-21: Wage deduction control: allow only lawful deductions with approval, limit on total deduction as a share of wages, fine and absence deduction rules, recovery priority, and an employee visible reason on the payslip.
- PAY-22: Payslip: present pay items, employer contributions, deductions, tax withheld with year to date, leave balances, loan balances, bank details masked, calendar month and period, Bangla and English, accessible PDF, release workflow, resend and revoke, and view log. Payslips never go as plain email attachments by default.
- PAY-23: Year end: tax certificate per employee, annual salary and withholding statement for the employer, reconciliation of deposits, correction and amendment workflow, and handling of employees who join or leave during the year (prior and next employer income, exit within year).
- PAY-24: Final settlement: unpaid wages, leave encashment, notice pay, gratuity, provident fund, bonus proration, loan recovery, asset recovery, tax on final payment, and statutory timeline for payment after separation per pack.

## Appendix A Requirement analysis and changes from v1

v1 was a sound specification for the payroll core, rule governance and architecture. It was thin or silent on the capabilities a world class SaaS HR product is judged on, and on everyday HR practice. v2 retained v1 sections and requirements, with the SaaS-to-SAS ID aliases recorded below. New sections are numbered 21 to 29 and appendices A to D, so existing tickets and tests remain valid.

### A.1 Gaps found and where they are fixed

| # | Gap in v1 | Severity | Fix in v2 |
|---|---|---|---|
| 1 | Roles were a ten line table; no custom roles, permission matrix, field level control, scoped assignment, access review, impersonation rules or role explainer | High | Section 24 |
| 2 | Audit existed as one requirement (NFR-03); no activity log screen, filters, export, integrity proof, employee transparency, SIEM stream or alerts | High | Section 25 |
| 3 | Reporting was a list of report topics; no catalogue, builder, schedules, saved views, dashboards, small group privacy, data access layer or statutory output control | High | Section 26 |
| 4 | No calendar model: holidays, bank holidays, bank closing days, weekly off rules, shifts, moon dependent dates and statutory deadline rollover were one line (ORG-03) | High | Section 21 |
| 5 | No people services: directory, announcements, surveys, service desk, grievance and disciplinary cases, onboarding templates, assets, expenses and recognition | Medium | Section 22 |
| 6 | Document handling was one clause (EMP-10); no confidentiality classes, personal file, generation, e-signature, access logging, retention or exit export | High | Section 23 |
| 7 | No notification centre, public API, developer portal, feature flags, billing detail, support tooling, status page, in-app help or sandbox environment | Medium | Section 27 |
| 8 | Privacy limited to NFR-04; no consent, data subject requests, classification, biometric handling, breach workflow or processing records | High | Section 28 |
| 9 | Bangladesh specifics (WPPF, minimum wage, wage payment deadline, festival bonus, PF recognition, overtime register, payslip content, final settlement) were not individually required | High | Section 29 and Appendix C |
| 10 | No Bangladesh numbers anywhere; developers had no seed data and could not write a first test | High | Appendix B (inherited unverified test candidates; v3 evidence restrictions apply), Appendix C (open items) |
| 11 | No target customer; the first cohort was undefined, so scope could not be tested for completeness | High | Sections 1.3 to 1.5 |
| 12 | Delivery plan unrealistic: 23 to 37 weeks for a payroll product needing two parallel cycles, a legal review and a tax year boundary | High | Section 17 revised |
| 13 | Bangla payslips, Bangla emails and mobile access sat in a later phase, but they are adoption conditions in Bangladesh | Medium | PLT-23 to PLT-25, phase moved |
| 14 | Competitor position, success metrics and pricing assumptions absent | Low | Section 1.5 |
| 15 | Prefix `SaaS-` clashed visually with the topic `SaaS`; ambiguity in tickets | Low | Renamed `SAS-` |
| 16 | Initial modular layout in 14.1 was finer grained than a small team can sustain | Medium | See Appendix D recommendation |
| 17 | The earlier requirement attachment was acknowledged as missing in v1 | Low | Statement removed because this document now stands alone |

### A.2 In place edits to v1 text

- Title and version header: Version 2.0, 23 October 2026.
- Section 1.2 and 1.3: jurisdiction, instruments and first cohort added after 1.2; Section 1.1 outcomes unchanged.
- Section 17: phase durations, calendar constraints and resourcing revised.
- Section 19.2: reusable prompt now references v2.
- Requirement prefix `SaaS-01` to `SaaS-05` renamed `SAS-01` to `SAS-05`.
- The v1 SaaS prefix was renamed in v2: SaaS-01 → SAS-01, SaaS-02 → SAS-02, SaaS-03 → SAS-03, SaaS-04 → SAS-04 and SaaS-05 → SAS-05. Preserve these aliases in ticket and test traceability. All other v1 IDs were retained.

### A.3 Not added on purpose

- Direct filing to NBR systems: still excluded until a supported interface and lawful authorization are verified (INT-04).
- Full applicant tracking, general ledger and VAT: outside scope (Section 1.2).
- Native mobile applications: the installable PWA meets the first release need (PLT-24).
- Machine learning features (for example attrition prediction): deferred, since they depend on data volume, privacy review and explainability.

## Appendix B Bangladesh seed rule pack (draft, not approved)

Status: `Quarantined development reference`. Exact parameter-level secondary citations and primary validation are missing. The prior B/C evidence labels are inherited claims, not verified evidence grades. Not practitioner reviewed. May be loaded only into explicitly isolated development/test environments, with no production tenant assignment and no payment output. Every row is unverified until its evidence record is completed. UI status alone is insufficient: production validators must reject unverified sources and test-only artifacts. It must not be activated for any tenant until the full LAW-04 workflow completes against the gazetted Finance Act 2026, the Income Tax Act 2023 as amended and the TDS Rules 2026. Any value marked below as `unconfirmed` must be replaced by an approved value before activation, and calculation must block while any activation relevant value remains unconfirmed.

Evidence grades after verification: A primary official text read; B identified professional publication; C identified press or aggregator; D unconfirmed or conflicting. All current parameter rows are U (unverified) until exact evidence is attached. Their former claimed grades have been removed to avoid implying verification.

### B.1 Pack identity

| Field | Value |
|---|---|
| Pack id | `BD-INCOME-TAX-SALARY` |
| Version | `FA2026-draft-1` |
| Jurisdiction | Bangladesh |
| Income years | Candidate only; applicability unresolved. Previously assumed the income year beginning 1 July 2026. Sources describe the parameters below for "FY2026-27 and FY2027-28" and sometimes label them assessment years 2026-27 and 2027-28; the labelling must be fixed from the Act text (open item L-25) |
| Effective from | Candidate 1 July 2026; not approved |
| Status | Quarantined development reference; never production assignable |

### B.2 Individual resident taxpayer parameters

All numbers below are inherited test candidates, not verified legal parameters. Do not present these tables as tax guidance.

| Parameter | Value | Grade |
|---|---|---|
| Tax free amount, general taxpayer | Tk 400,000 | U |
| Tax free amount, woman | Tk 450,000 | U |
| Tax free amount, age 65 or over | Tk 450,000 | U |
| Tax free amount, person with disability | Tk 525,000 | U |
| Tax free amount, third gender | Tk 525,000 | U |
| Tax free amount, gazetted war wounded freedom fighter and July warrior | Tk 550,000 | U |
| Precedence where several categories apply | Not stated by sources; practitioner rule required, never add | U |
| Slab structure after the tax free amount | 10% on next 300,000; 15% on next 400,000; 20% on next 500,000; 25% on next 2,000,000; 30% on the remainder | U |
| Scheduled tax free amounts for later years | Tk 450,000 for the two years following; Tk 500,000 for the next, reported as legislated; verify | U |
| Minimum tax (assessment, not applied by employer) | Tk 5,000; Tk 1,000 for new taxpayers | U |
| Salary exemption | Lower of one third of employment income and Tk 500,000 | U |
| Investment rebate | 10% of eligible investment, subject to caps; the other limbs of the cap must be taken from the Act. A cap of Tk 750,000 is reported | U |
| Early filing incentive | 5% rebate for returns filed 1 July to 30 September, capped at Tk 25,000, reported | U |
| Extra relief for parent or guardian of person with disability | Tk 50,000 per dependant, reported as proposed; enactment unconfirmed | U |
| Indigenous community salary exemption | Extended to salary income per budget speech; conditions and enactment unconfirmed | U |

### B.3 Employer withholding on salary (TDS)

| Parameter | Value | Grade |
|---|---|---|
| Governing provision | Section 86 of the Income Tax Act 2023, with TDS Rules 2026 | U |
| Method | Average rate method: estimate total annual tax on projected annual salary income, divide to withhold evenly, true up when income or declarations change | U |
| Minimum tax at employer level | Not applied | U |
| Rebate at employer level | Apply only when the declaration and evidence rule in the pack is satisfied; otherwise do not | U |
| Deposit deadline | Reported as within a fixed number of days after the end of the month of deduction; verify under TDS Rules 2026 | U |
| Return frequency | Quarterly or monthly: conflicting sources | U |
| Certificate to employee | Annually, with the form and deadline from the Rules | U |
| Penalty for failure to deduct or deposit | Amount and method vary by source | U |
| AIT | Separate from salary TDS; salary TDS credited in the employee return | U |

### B.4 Draft calculation test candidates (TEST ONLY)

Purpose: smoke tests for the engine and for the first practitioner review session. They are not golden cases until a Bangladesh tax practitioner independently signs them. Each assumes a resident general or named category employee, 12 months, all pay taxable salary, no other income, no investment rebate, no early filing incentive, no prior employer, and the simplified exemption rule above.

| Case | Monthly gross | Category | Annual gross | Exemption | Taxable | Expected annual tax | Expected monthly TDS |
|---|---|---|---|---|---|---|---|
| T-01 | 50,000 | General | 600,000 | 200,000 | 400,000 | 0 | 0 |
| T-02 | 100,000 | General | 1,200,000 | 400,000 | 800,000 | 45,000 | 3,750 |
| T-03 | 100,000 | Woman | 1,200,000 | 400,000 | 800,000 | 37,500 | 3,125 |
| T-04 | 100,000 | Person with disability | 1,200,000 | 400,000 | 800,000 | 27,500 | 2,291.67 (round per pack) |
| T-05 | 300,000 | General | 3,600,000 | 500,000 | 3,100,000 | 565,000 | 47,083.33 (round per pack) |

Working for T-05: tax free 400,000; next 300,000 at 10% = 30,000; next 400,000 at 15% = 60,000; next 500,000 at 20% = 100,000; remaining 3,100,000 − 1,600,000 = 1,500,000 at 25% = 375,000; total 565,000. Rounding of monthly TDS (to the taka, to paisa, or rounding up) is a pack rule awaiting confirmation (L-26).

Required additional test families (to be authored with the practitioner): bonus in a single month, mid year joiner, mid year leaver, raise in the middle of the year, prior employer income, arrears of a prior year, employer provided car and accommodation, house rent and conveyance component exemptions, provident fund contribution rules, loan interest perquisite, overseas posting, employees with several categories, employee refusing to provide TIN, and the corrections of a deduction found wrong after deposit.

### B.5 Labour and benefits parameters (draft; all secondary source, unconfirmed)

| Area | Value reported | Grade |
|---|---|---|
| Weekly holiday | One day in factory and similar establishments; one and a half days in shops and commercial establishments (Labour Act 2006), verify amendments | U |
| Casual leave | 10 days per year | U |
| Sick leave | 14 days per year (shops and commercial and industrial), verify | U |
| Annual leave | One day for every 18 days worked (and a different ratio for some establishment types) | U |
| Festival holidays | Reported as 13 after the 2025 or 2026 amendment; original Act had 11 | U |
| Maternity leave | 120 days reported after amendment; original Act 16 weeks | U |
| Overtime | Double the ordinary rate of basic plus allowances, with weekly and daily caps | U |
| Wage payment deadline | By the seventh working day after the end of the wage period for most workers; faster for terminated or resigned workers | U |
| Provident fund | Mandatory trigger for establishments reaching a worker count threshold reported as 100; contribution rate by agreement; recognition by NBR | U |
| Gratuity | Based on length of service tiers; verify the revised tiers | U |
| WPPF | 5% of net profit for qualifying establishments, split among participation, welfare and workers funds; verify thresholds and split | U |
| Festival bonus | Reported as a statutory requirement in some establishment classes after the amendment; contractual practice often two bonuses; verify | U |

## Appendix C Open legal and policy items for Phase 0

Each item needs an owner (tax practitioner, labour lawyer, product owner), a source citation, a decision, a date and a test. Calculation of the affected scenario stays blocked until closed.

| ID | Item | Status | Needed from |
|---|---|---|---|
| L-01 | Salary TDS return frequency (quarterly or monthly) and form | Conflicting | Tax practitioner, TDS Rules 2026 text |
| L-02 | Deposit deadlines for salary TDS including the June month and year end rule | Unconfirmed | Tax practitioner, TDS Rules 2026 |
| L-03 | Penalty and additional tax for failure to deduct or deposit salary TDS (50% versus 150% versions seen) | Conflicting | Tax practitioner, Act text |
| L-04 | Whether the higher rate for missing proof of return submission applies to salary income | Unconfirmed | Tax practitioner |
| L-05 | Enactment and conditions of Tk 50,000 relief for disabled dependants | Unconfirmed | Act text |
| L-06 | Rollover of statutory due dates falling on holidays | Unconfirmed | Counsel |
| L-07 | Perquisite valuation (car, accommodation, loans, utilities, club) for the current year | Unconfirmed | Tax practitioner |
| L-08 | Number and treatment of festival holidays, substitution, pay on festival holiday work | Conflicting | Labour lawyer, amended Act text |
| L-09 | Net wealth and environmental surcharge enactment and employer role | Unconfirmed | Tax practitioner |
| L-10 | Non resident individual rate and exemptions applicable to salary | Unconfirmed | Tax practitioner (later pack) |
| L-11 | Wage payment deadlines by class and bank holiday effect | Unconfirmed | Labour lawyer |
| L-12 | Provident fund mandate, threshold and contribution rule | Unconfirmed | Labour lawyer |
| L-13 | Gratuity tiers and calculation base after amendment | Unconfirmed | Labour lawyer |
| L-14 | WPPF thresholds, split and distribution deadlines | Unconfirmed | Labour lawyer |
| L-15 | Maternity and paternity leave, eligibility and pay, after amendment | Conflicting | Labour lawyer |
| L-16 | Overtime caps, rate base and exemptions by worker class | Unconfirmed | Labour lawyer |
| L-17 | Minimum wage orders by sector relevant to the first cohort | Unconfirmed | Labour lawyer |
| L-18 | Indigenous community exemption for salary: eligibility, evidence | Unconfirmed | Tax practitioner |
| L-19 | Investment rebate formula and eligible instruments for the current year | Conflicting | Tax practitioner |
| L-20 | Early filing incentive exact conditions | Unconfirmed | Tax practitioner |
| L-21 | Minimum tax for new taxpayers | Conflicting | Tax practitioner |
| L-22 | Legally sufficient electronic signature type for each HR document | Unconfirmed | Counsel |
| L-23 | Applicable Bangladesh data protection law and its enforcement status | Unconfirmed | Counsel |
| L-24 | Festival bonus: statutory obligation, base and eligibility | Unconfirmed | Labour lawyer |
| L-25 | Assessment year labelling for income years under the 2026 Act | Unconfirmed | Tax practitioner |
| L-26 | Rounding rule for monthly TDS | Unconfirmed | Tax practitioner |
| L-27 | Primary text acquisition: the gazetted Finance Act 2026, TDS Rules 2026, Labour Act 2006 as amended, Labour Rules 2015 as amended (bdlaws pages blocked automated access; obtain through counsel) | Open | Product owner |

## Appendix D Recommended simplifications and resourcing

- Use the five business modules defined in Section 14.1: Platform, People, Time, Pay and Insight. Deploy web, API and worker initially; do not interpret the five modules as five services. Split only after a measured need.
- Phase 0 must contract a Bangladesh income tax practitioner and a labour lawyer with named hours, a review turnaround time and budget. Without them the Phase 3 gate cannot be passed.
- Obtain primary texts (L-27) in the first week of Phase 0; secondary summaries are a drafting aid only.
- Appoint a payroll product owner who has run Bangladesh payroll, to author scenarios and accept results.
- Pick two or three pilot customers within the cohort before Phase 3 starts, and agree to share anonymised historic payroll for parallel runs.
- Avoid first live payroll in the month containing Eid or the 30 June year end, and avoid enabling a new annual pack during the month it takes effect without a parallel cycle.


## 30 Payroll operations and employee confidence

- OPS-01: Provide a payroll control workspace by entity and pay group, showing cutoff, input completeness, readiness blockers, period variance, funding totals, approvals, bank instructions, payment outcomes, statutory due dates and accountable owners. Every total drills down to the same frozen revision. Acceptance: an incomplete run cannot display a ready or reconciled status.
- OPS-02: Provide an employee payroll query workflow linked to an exact payslip version and component. Record question, confidential attachments, assigned payroll handler, response target, explanation, approved correction, linked adjustment and employee notification. Employees cannot edit financial records. Acceptance: resolution either explains the original item or links to a separately approved adjustment without overwriting the original payslip.
- OPS-03: Bank-detail changes require independent verification, notice through a previously verified channel, effective date and a payment-impact preview. Keep the approved destination version on each payment instruction. A change after approval invalidates affected unreleased instructions or requires reapproval. Define fallback where the old channel is unavailable; never rely solely on the newly supplied contact/account. Acceptance: changing an account cannot silently redirect an approved payment.
- OPS-04: Maintain a data-quality queue for missing evidence, invalid bank formats, date conflicts, missing compensation, duplicate payment destinations and opening-balance differences. Distinguish missing facts, suspected anomalies and confirmed errors. Shared accounts are review signals, not automatic fraud findings. Acceptance: each blocking defect has an owner and remediation record, with resolution revalidated before payroll approval.
- OPS-05: Model payment outcomes including not submitted, submitted, acknowledged, accepted, rejected, partially settled, settled, returned and unknown. Channel-specific mappings define which acknowledgements prove settlement. Unknown outcomes prohibit automated reissue until reconciled. Acceptance: a timeout after bank submission cannot result in a second salary instruction merely through retry.
- OPS-06: After backup restoration, reconcile external payment outcomes, deposits, issued documents, security revocations and deletion/legal-hold requests newer than the recovery point. Use a separately protected minimal recovery journal for critical external references and revocations, with the same privacy/retention controls. Fence stale workers and disable money movement until reconciliation is approved. Acceptance: a restored snapshot cannot repay settled wages or reactivate a known revoked account.
- OPS-07: Present an authorized employee explanation of net-pay changes and tax calculations using trace data: changed compensation, bonus, unpaid leave, arrears, deductions, declarations and pack versions. Separate actual results from projection assumptions; show no other employee information. Acceptance: each displayed amount reconciles to the payslip or its explicit comparison revision, without an LLM generating financial facts.
- OPS-08: Manage funding readiness separately from salary calculation: funding amount by account/channel, approval deadline, confirmed availability where supported and exceptions. A balance estimate is not a guarantee of bank settlement. Acceptance: no run is marked paid based on a funding check, export or submission alone.

## 31 Experience support and verification standards

- EXP-01: Before R0, test payslip access, leave request, tax declaration and payroll preparation with representative employees, managers and payroll officers using synthetic or approved masked data. Proposed targets: at least 90% unassisted task completion; an employee can locate and open their payslip within 60 seconds; a standard leave request within two minutes. Phase 0 records device/network conditions and sample composition. Report failures and redesign before cohort expansion; legal/financial errors cannot be averaged away by task-success metrics.
- EXP-02: Before commercial release, publish support severities and coverage. Proposed baseline: P1 payroll-blocking or suspected material data exposure acknowledged within 30 minutes during the contracted payroll support window, owner assigned immediately, updates at least hourly; P2 materially degraded workflow acknowledged within four covered hours; P3 ordinary requests within one covered business day. Define escalation, holidays, customer communications, workaround validation and post-incident review. Distinguish response targets from resolution promises and fund staffing before contractual commitment.
- EXP-03: Use an applicable OWASP ASVS 5.0 control profile, targeting Level 2 as the minimum engineering baseline with stronger selected controls for privileged access and money movement. Maintain control-to-test evidence, threat-model decisions and independently reviewed exclusions; do not claim certification from checklist completion. Source reference: https://owasp.org/projects/asvs . Pin the reviewed version during Phase 0.
- EXP-04: Define a device/browser capability matrix for PWA attendance and authentication. Verify camera, location, push and QR behavior on supported combinations; Wi-Fi identifiers and device attestation are not assumed available to a web app. Provide manual correction and accessible alternatives. Acceptance: unsupported methods cannot be enabled without a tested fallback, and location collection cannot silently continue outside its declared purpose.
- EXP-05: Define offline data allowlists, encryption where supported, cache lifetime and cleanup on logout/account switch. Default to no offline storage of payslips, tax evidence, medical/case documents or report exports. Offline leave drafts are tentative until server validation; use idempotent submission and conflict handling. Acceptance: an expired session/shared-device account switch cannot expose another user's cached records or approve a draft offline.
- EXP-06: Permission revocation must invalidate server sessions, token entitlements, cached authorization, pending exports, search results, document links and calendar feeds within a documented target of 60 seconds for connected clients; sensitive operations always perform a fresh server decision. Revocation cannot remove copies already downloaded, which must be stated accurately. Acceptance: loss of payroll access prevents an old export link from disclosing data.
- EXP-07: For sensitive analytics, control repeated filtering, overlapping groups, complementary totals, drill-down and exports that could reveal suppressed values. Test representative inference attacks and document residual risks. Minimum-group suppression is one layer, not an anonymity guarantee. Acceptance: a hidden disability/medical group cannot be recovered by subtracting exposed related totals through ordinary report operations.
- EXP-08: Add operational measures: payroll first-pass acceptance, manual corrections per cycle, escaped calculation defects by severity, on-time payment rate, deposit completion, time to resolve pay queries and customer onboarding duration. Specify numerator, denominator, exclusions and evidence source. Measure actual payment and statutory completion, not only successful calculations.

## 32 Workforce and compensation development

- WFP-01: Model approved positions separately from people, with entity, job family, grade, FTE, budget owner, approved dates, incumbent assignments and vacancies. Define how concurrent assignments consume capacity. Acceptance: a position can remain vacant without a dummy employee, and incumbency history is retained.
- WFP-02: Support workforce scenarios and headcount approvals comparing current and proposed positions, replacements, planned start dates, vacancies and salary/benefit employer costs. Scenarios never change live payroll until underlying changes are separately approved. Acceptance: a forecast and its assumptions can be reproduced without creating payables.
- WFP-03: Maintain versioned job families, salary bands, ranges and progression paths. Report an employee's position against the authorized range without exposing peers' salaries. Acceptance: a band change does not automatically change an employment agreement.
- WFP-04: Provide controlled compensation-equity analysis with scoped access, cohort definitions, minimum-group and inference safeguards, documented limitations and human review. Do not infer protected attributes or automate employment decisions. Acceptance: analysis cannot change pay or disclose identifiable peer records through small groups.

## 33 Implementation contracts and release governance

- GOV-01: Every requirement has a release, accountable role, dependency bundle and acceptance-test identifier in Appendix F. All start Planned. At implementation kickoff assign a named owner, ticket, estimate and reviewer; before completion attach executable/manual test evidence. A matrix row is not implementation evidence.
- GOV-02: For each workflow, write a state/transition contract identifying actors, preconditions, checks, approvals, timeouts, delegation, cancellation, reopening, external uncertainty and audit events. Define non-overridable controls once and reuse them. Acceptance: every transition has positive and denial tests, including stale revisions and self-approval attempts.
- GOV-03: Before schema implementation, publish entity/field contracts containing types, constraints, ownership, tenant/entity scope, sensitivity, effective/recorded time, retention, API mapping and migration behavior. Acceptance: server validation and database constraints reject representative invalid/cross-tenant inputs.
- GOV-04: Before a screen is accepted, document each role's visible fields/actions, empty/loading/error states, validation, bulk behavior, accessibility, responsive layout and sensitive-data masking. Acceptance: complete the role-specific tasks and denial paths against the implemented screen, not only a static mockup.
- GOV-05: Every legal parameter requires an evidence record containing exact source URL or retained document identifier, title, issuing authority, publication date, section/page, relevant extract, source hash, legal status/commencement determination and reviewer. Unverified inherited candidates remain U. Acceptance: activation fails if any applicable parameter lacks authoritative evidence, approved applicability or an independent expected-result test.
- GOV-06: Define the legal-pack schema with typed parameters, decision predicates, precedence, rounding, effective dates, migration/transitional treatment, signer approvals and engine compatibility. Sign or integrity-check release artifacts; production rejects test-only packs and unapproved artifacts even when their UI label is changed. Acceptance: modifying a draft status field alone cannot make the pack production assignable.
- GOV-07: Pilot acceptance is risk based: resolve all material differences at approved component-level precision, document lawful rounding and rounding residual allocation, and prohibit unexplained offsetting differences that merely net to the same salary. Acceptance: two wrong components cannot pass because their errors cancel.
- GOV-08: Keep release commitments explicit. R0 is a controlled payroll pilot for the approved cohort; R1 is commercial core; R2 is advanced/expanded capability. A feature needed for an applicable legal obligation moves forward before that customer's activation regardless of its default release. Additions require scope/budget review; do not silently bundle advanced functions into launch.

## Appendix E V3 changes and acceptance guidance

### E.1 Changes from v2

V3 retains all 325 individually numbered v2 requirements and all eight PRN principle IDs, and adds OPS, EXP, WFP and GOV requirements. It resolves override and reporting conflicts in the operative requirements, aligns the architecture, strengthens payment and recovery controls, records evidence gaps honestly and maps all requirements to releases. Numerical Appendix B candidates are retained only as unverified development references; this revision does not validate their legal accuracy.

| Review finding | V3 resolution |
|---|---|
| Legal grades without traceable sources | Appendix B downgraded to U; GOV-05 and GOV-06 require exact evidence and production enforcement. |
| Mandatory deadline treated as overridable | CAL-15 and PAY-15 distinguish noncompliance remediation from permission to waive law. |
| Maker/checker exceptions conflict with core rules | SEC-02 and RBAC-06 prohibit transaction self-approval across roles/accounts. |
| Scheduled report disclosure | RPT-06 and RPT-07 require owner/recipient intersection and download revalidation. |
| Emergency file may repay settled wages | PLT-34, OPS-05 and OPS-06 require external-status reconciliation and no automatic unknown-outcome retries. |
| Conflicting architecture structures | Section 14.1 and Appendix D now use the same five business modules and three initial deployment units. |
| Unassigned feature scope | Appendix F covers every requirement; advanced capabilities move to R2 with legal applicability overrides. |
| Missing operational capabilities | Section 30 adds control workspace, pay queries, bank-change safety, quality queue, funding and explanations. |
| Usability, support and assurance | Section 31 adds measurable task testing, payroll support targets and ASVS evidence. |
| Offline, revocation and analytics risks | EXP-04 through EXP-07 add tested capability limits, caching restrictions and inference controls. |
| Workforce and salary structures | Section 32 adds position budgeting, salary bands and controlled equity analysis as R2. |
| AI implementation ambiguity | Section 33 requires workflow, data, screen and rule contracts plus requirement-level test evidence. |

### E.1a Changes in v3.1 (final baseline)

- Section 17: corrected two garbled sentences, removed stale "v2" wording, and replaced the 9 to 14 month pilot estimate with 11 to 15 months to first live payroll after reviewing the R0 scope (Appendix F: 294 of 361 requirements are assigned R0 in the matrix).
- Appendix F: nine convenience capabilities moved from R0 to R1 (see F.1). Interim controls are stated so that no obligation is left uncovered.
- Appendix B and C unchanged: all tax and labour parameters remain unverified (U) and the 27 open legal items remain blocking for activation. v3.1 adds no new legal facts.
- Remaining open decisions are owned in Phase 0: cohort confirmation, pilot customers, practitioner and counsel contracting, hosting and data protection, pricing.

### E.2 Planning clarifications

The phase durations in Section 17 remain provisional estimates, not a delivery guarantee. Re-estimate after Phase 0 against Appendix F and available staffing. R2 is not required for initial commercial acceptance unless a customer's applicable obligation makes it mandatory. A legal pack cannot always receive a full pre-July parallel cycle if final law is published late; the accelerated independent validation path must be documented and approved.

The source record links for discovery are https://nbr.gov.bd/taxtypes/income-tax/income-tax-paripatra/eng and https://nbr.gov.bd/publications/income-tax/eng . These indexes are not parameter-level citations. No exact legal source or legal interpretation has been invented to close Appendix C.

### E.3 Definition of requirement acceptance

Each Appendix F test identifier must become a concrete test specification before that requirement is built. It inherits the exact mandatory behavior in its requirement text and the relevant GOV contracts. For financial/legal cases, expected intermediate amounts, rounding, output and evidence must be independently approved. For permissions, include authorized and denied cases on every relevant channel. For queues/integrations, include retry, timeout and partial-failure tests. Mark Passed only with actual evidence; absent tests remain Planned or Blocked.

## Appendix F Requirement release and accountability matrix

This is the exhaustive release assignment for normative requirement IDs. It preserves scope without requiring every advanced feature for launch. Dependency bundles below are expanded into concrete tickets in Phase 0; they are not permission to skip a prerequisite. Accountable roles are assignments to be filled, not claims that those people are already appointed.

| Code | Dependency or acceptance basis |
|---|---|
| BASE | Tenant/identity model, approved architecture/data contracts and CI. |
| AUTH | BASE plus permissions, audit and field classification. |
| PEOPLE | AUTH plus effective-dated people and organization records. |
| TIME | PEOPLE plus approved calendars, attendance/leave rules and ledgers. |
| LEGAL | Source/applicability register, independent practitioner approval and approved scenario fixtures. |
| PAY | PEOPLE, TIME where applicable, LEGAL, deterministic engine and snapshot contracts. |
| CASH | PAY plus approved bank/channel mappings, maker/checker and reconciliation. |
| INSIGHT | AUTH plus governed datasets, metric definitions and privacy tests. |
| OPS | BASE plus monitored deployment, incident/recovery runbooks and exercised controls. |
| EXPAND | Accepted core contracts plus separate advanced-feature or legal-regime review. |

Release codes: R0 = required before first controlled live payroll for the relevant cohort (Phases 0–4); R1 = required before initial commercial core acceptance (Phase 5–6 or earlier); R2 = later advanced/expanded capability (Phase 7 or a separately approved roadmap release). R0 requirements are implemented in the appropriate earlier phase, not all at Phase 4. Cohort-specific applicable obligations always override a later default assignment.

Some IDs contain both core and advanced subfeatures. An asterisk means the core requirement applies at the displayed release, while the explicitly listed advanced subfeature is R2; do not mark that whole ID fully complete until both are delivered. A hash means a later feature has a mandatory launch prerequisite stated below. All unlisted subfeatures follow their row release.

| Requirement ID | Release | Accountable role | Dependencies | Acceptance test ID | Initial status |
|---|---|---|---|---|---|
| PRN-01 | R0 | Technical lead | BASE + LEGAL where relevant | AT-PRN-01 | Planned |
| PRN-02 | R0 | Technical lead | BASE + LEGAL where relevant | AT-PRN-02 | Planned |
| PRN-03 | R0 | Technical lead | BASE + LEGAL where relevant | AT-PRN-03 | Planned |
| PRN-04 | R0 | Technical lead | BASE + LEGAL where relevant | AT-PRN-04 | Planned |
| PRN-05 | R0 | Technical lead | BASE + LEGAL where relevant | AT-PRN-05 | Planned |
| PRN-06 | R0 | Technical lead | BASE + LEGAL where relevant | AT-PRN-06 | Planned |
| PRN-07 | R0 | Technical lead | BASE + LEGAL where relevant | AT-PRN-07 | Planned |
| PRN-08 | R0 | Technical lead | BASE + LEGAL where relevant | AT-PRN-08 | Planned |
| SEC-01 | R0 | Security lead | AUTH | AT-SEC-01 | Planned |
| SEC-02 | R0 | Security lead | AUTH | AT-SEC-02 | Planned |
| SEC-03 | R0 | Security lead | AUTH | AT-SEC-03 | Planned |
| SEC-04 | R0 | Security lead | AUTH | AT-SEC-04 | Planned |
| SEC-05 | R0 | Security lead | AUTH | AT-SEC-05 | Planned |
| ORG-01 | R0 | HR product owner | PEOPLE | AT-ORG-01 | Planned |
| ORG-02 | R0 | HR product owner | PEOPLE | AT-ORG-02 | Planned |
| ORG-03 | R0 | HR product owner | PEOPLE | AT-ORG-03 | Planned |
| ORG-04 | R0 | HR product owner | PEOPLE | AT-ORG-04 | Planned |
| ORG-05 | R0 | HR product owner | PEOPLE | AT-ORG-05 | Planned |
| ORG-06 | R0 | HR product owner | PEOPLE | AT-ORG-06 | Planned |
| ORG-07 | R0 | HR product owner | PEOPLE | AT-ORG-07 | Planned |
| ORG-08 | R0 | HR product owner | PEOPLE | AT-ORG-08 | Planned |
| EMP-01 | R0 | HR product owner | PEOPLE | AT-EMP-01 | Planned |
| EMP-02 | R0 | HR product owner | PEOPLE | AT-EMP-02 | Planned |
| EMP-03 | R0 | HR product owner | PEOPLE | AT-EMP-03 | Planned |
| EMP-04 | R0 | HR product owner | PEOPLE | AT-EMP-04 | Planned |
| EMP-05 | R0 | HR product owner | PEOPLE | AT-EMP-05 | Planned |
| EMP-06 | R0 | HR product owner | PEOPLE | AT-EMP-06 | Planned |
| EMP-07 | R0 | HR product owner | PEOPLE | AT-EMP-07 | Planned |
| EMP-08 | R0 | HR product owner | PEOPLE | AT-EMP-08 | Planned |
| EMP-09 | R0 | HR product owner | PEOPLE | AT-EMP-09 | Planned |
| EMP-10 | R0 | HR product owner | PEOPLE | AT-EMP-10 | Planned |
| EMP-11 | R0 | HR product owner | PEOPLE | AT-EMP-11 | Planned |
| ATT-01 | R0 | Time module lead | TIME + LEGAL | AT-ATT-01 | Planned |
| ATT-02 | R0 | Time module lead | TIME + LEGAL | AT-ATT-02 | Planned |
| ATT-03 | R0 | Time module lead | TIME + LEGAL | AT-ATT-03 | Planned |
| ATT-04 | R0 | Time module lead | TIME + LEGAL | AT-ATT-04 | Planned |
| LEV-01 | R0 | Time module lead | TIME + LEGAL | AT-LEV-01 | Planned |
| LEV-02 | R0 | Time module lead | TIME + LEGAL | AT-LEV-02 | Planned |
| LEV-03 | R0 | Time module lead | TIME + LEGAL | AT-LEV-03 | Planned |
| LEV-04 | R0 | Time module lead | TIME + LEGAL | AT-LEV-04 | Planned |
| LEV-05 | R0 | Time module lead | TIME + LEGAL | AT-LEV-05 | Planned |
| LEV-06 | R0 | Time module lead | TIME + LEGAL | AT-LEV-06 | Planned |
| PER-01 | R1 | HR product owner | PEOPLE + AUTH | AT-PER-01 | Planned |
| PER-02 | R1* | HR product owner | PEOPLE + AUTH | AT-PER-02 | Planned |
| PER-03 | R1 | HR product owner | PEOPLE + AUTH | AT-PER-03 | Planned |
| PER-04 | R1 | HR product owner | PEOPLE + AUTH | AT-PER-04 | Planned |
| PER-05 | R1 | HR product owner | PEOPLE + AUTH | AT-PER-05 | Planned |
| APR-01 | R1 | HR product owner | PEOPLE + AUTH | AT-APR-01 | Planned |
| APR-02 | R1 | HR product owner | PEOPLE + AUTH | AT-APR-02 | Planned |
| APR-03 | R1 | HR product owner | PEOPLE + AUTH | AT-APR-03 | Planned |
| COM-01 | R0 | Platform lead | AUTH + PEOPLE | AT-COM-01 | Planned |
| COM-02 | R0 | Platform lead | AUTH + PEOPLE | AT-COM-02 | Planned |
| COM-03 | R0 | Platform lead | AUTH + PEOPLE | AT-COM-03 | Planned |
| COM-04 | R0 | Platform lead | AUTH + PEOPLE | AT-COM-04 | Planned |
| COM-05 | R0 | Platform lead | AUTH + PEOPLE | AT-COM-05 | Planned |
| COM-06 | R0 | Platform lead | AUTH + PEOPLE | AT-COM-06 | Planned |
| PAY-01 | R0 | Payroll lead | PAY + LEGAL | AT-PAY-01 | Planned |
| PAY-02 | R0 | Payroll lead | PAY + LEGAL | AT-PAY-02 | Planned |
| PAY-03 | R0 | Payroll lead | PAY + LEGAL | AT-PAY-03 | Planned |
| PAY-04 | R0 | Payroll lead | PAY + LEGAL | AT-PAY-04 | Planned |
| PAY-05 | R0 | Payroll lead | PAY + LEGAL | AT-PAY-05 | Planned |
| PAY-06 | R0 | Payroll lead | PAY + LEGAL | AT-PAY-06 | Planned |
| PAY-07 | R0 | Payroll lead | PAY + LEGAL | AT-PAY-07 | Planned |
| PAY-08 | R0 | Payroll lead | PAY + LEGAL | AT-PAY-08 | Planned |
| PAY-09 | R0 | Payroll lead | PAY + LEGAL | AT-PAY-09 | Planned |
| PAY-10 | R0 | Payroll lead | PAY + LEGAL | AT-PAY-10 | Planned |
| PAY-11 | R0 | Payroll lead | PAY + LEGAL | AT-PAY-11 | Planned |
| PAY-12 | R0 | Payroll lead | PAY + LEGAL | AT-PAY-12 | Planned |
| PAY-13 | R0 | Payroll lead | PAY + LEGAL | AT-PAY-13 | Planned |
| PAY-14 | R0 | Payroll lead | PAY + LEGAL | AT-PAY-14 | Planned |
| BEN-01 | R0 | Payroll lead | PAY + LEGAL | AT-BEN-01 | Planned |
| BEN-02 | R0 | Payroll lead | PAY + LEGAL | AT-BEN-02 | Planned |
| BEN-03 | R0 | Payroll lead | PAY + LEGAL | AT-BEN-03 | Planned |
| BEN-04 | R0 | Payroll lead | PAY + LEGAL | AT-BEN-04 | Planned |
| BEN-05 | R0 | Payroll lead | PAY + LEGAL | AT-BEN-05 | Planned |
| BEN-06 | R0 | Payroll lead | PAY + LEGAL | AT-BEN-06 | Planned |
| TAX-01 | R0 | Payroll lead | PAY + LEGAL | AT-TAX-01 | Planned |
| TAX-02 | R0 | Payroll lead | PAY + LEGAL | AT-TAX-02 | Planned |
| TAX-03 | R0 | Payroll lead | PAY + LEGAL | AT-TAX-03 | Planned |
| TAX-04 | R0 | Payroll lead | PAY + LEGAL | AT-TAX-04 | Planned |
| TAX-05 | R0 | Payroll lead | PAY + LEGAL | AT-TAX-05 | Planned |
| TAX-06 | R0 | Payroll lead | PAY + LEGAL | AT-TAX-06 | Planned |
| TAX-07 | R0 | Payroll lead | PAY + LEGAL | AT-TAX-07 | Planned |
| TAX-08 | R0 | Payroll lead | PAY + LEGAL | AT-TAX-08 | Planned |
| TAX-09 | R0 | Payroll lead | PAY + LEGAL | AT-TAX-09 | Planned |
| TAX-10 | R0 | Payroll lead | PAY + LEGAL | AT-TAX-10 | Planned |
| TAX-11 | R0 | Payroll lead | PAY + LEGAL | AT-TAX-11 | Planned |
| TAX-12 | R0 | Payroll lead | PAY + LEGAL | AT-TAX-12 | Planned |
| TAX-13 | R0 | Payroll lead | PAY + LEGAL | AT-TAX-13 | Planned |
| TAX-14 | R0 | Payroll lead | PAY + LEGAL | AT-TAX-14 | Planned |
| TAX-15 | R0 | Payroll lead | PAY + LEGAL | AT-TAX-15 | Planned |
| TAX-16 | R0 | Payroll lead | PAY + LEGAL | AT-TAX-16 | Planned |
| TAX-17 | R0 | Payroll lead | PAY + LEGAL | AT-TAX-17 | Planned |
| LAW-01 | R0 | Compliance lead | LEGAL | AT-LAW-01 | Planned |
| LAW-02 | R0 | Compliance lead | LEGAL | AT-LAW-02 | Planned |
| LAW-03 | R0 | Compliance lead | LEGAL | AT-LAW-03 | Planned |
| LAW-04 | R0 | Compliance lead | LEGAL | AT-LAW-04 | Planned |
| LAW-05 | R0 | Compliance lead | LEGAL | AT-LAW-05 | Planned |
| LAW-06 | R0 | Compliance lead | LEGAL | AT-LAW-06 | Planned |
| LAW-07 | R0 | Compliance lead | LEGAL | AT-LAW-07 | Planned |
| LAW-08 | R0 | Compliance lead | LEGAL | AT-LAW-08 | Planned |
| LAW-09 | R0 | Compliance lead | LEGAL | AT-LAW-09 | Planned |
| LAW-10 | R0 | Compliance lead | LEGAL | AT-LAW-10 | Planned |
| REP-01 | R0 | Reporting lead | INSIGHT | AT-REP-01 | Planned |
| REP-02 | R0 | Reporting lead | INSIGHT | AT-REP-02 | Planned |
| REP-03 | R0 | Reporting lead | INSIGHT | AT-REP-03 | Planned |
| REP-04 | R0 | Reporting lead | INSIGHT | AT-REP-04 | Planned |
| REP-05 | R0 | Reporting lead | INSIGHT | AT-REP-05 | Planned |
| REP-06 | R0 | Reporting lead | INSIGHT | AT-REP-06 | Planned |
| REP-07 | R0 | Reporting lead | INSIGHT | AT-REP-07 | Planned |
| REP-08 | R0 | Reporting lead | INSIGHT | AT-REP-08 | Planned |
| SAS-01 | R1 | Platform product owner | AUTH + OPS | AT-SAS-01 | Planned |
| SAS-02 | R1 | Platform product owner | AUTH + OPS | AT-SAS-02 | Planned |
| SAS-03 | R0 | Platform product owner | AUTH + OPS | AT-SAS-03 | Planned |
| SAS-04 | R0 | Platform product owner | AUTH + OPS | AT-SAS-04 | Planned |
| SAS-05 | R0 | Platform product owner | AUTH + OPS | AT-SAS-05 | Planned |
| ARCH-01 | R0 | Technical lead | BASE + OPS | AT-ARCH-01 | Planned |
| ARCH-02 | R0 | Technical lead | BASE + OPS | AT-ARCH-02 | Planned |
| ARCH-03 | R0 | Technical lead | BASE + OPS | AT-ARCH-03 | Planned |
| ARCH-04 | R0 | Technical lead | BASE + OPS | AT-ARCH-04 | Planned |
| ARCH-05 | R0 | Technical lead | BASE + OPS | AT-ARCH-05 | Planned |
| ARCH-06 | R0 | Technical lead | BASE + OPS | AT-ARCH-06 | Planned |
| ARCH-07 | R0 | Technical lead | BASE + OPS | AT-ARCH-07 | Planned |
| ARCH-08 | R0 | Technical lead | BASE + OPS | AT-ARCH-08 | Planned |
| ARCH-09 | R0 | Technical lead | BASE + OPS | AT-ARCH-09 | Planned |
| ARCH-10 | R0 | Technical lead | BASE + OPS | AT-ARCH-10 | Planned |
| NFR-01 | R0 | Technical lead | BASE + OPS | AT-NFR-01 | Planned |
| NFR-02 | R0 | Technical lead | BASE + OPS | AT-NFR-02 | Planned |
| NFR-03 | R0 | Technical lead | BASE + OPS | AT-NFR-03 | Planned |
| NFR-04 | R0 | Technical lead | BASE + OPS | AT-NFR-04 | Planned |
| NFR-05 | R0 | Technical lead | BASE + OPS | AT-NFR-05 | Planned |
| NFR-06 | R0 | Technical lead | BASE + OPS | AT-NFR-06 | Planned |
| NFR-07 | R0 | Technical lead | BASE + OPS | AT-NFR-07 | Planned |
| NFR-08 | R0 | Technical lead | BASE + OPS | AT-NFR-08 | Planned |
| NFR-09 | R0 | Technical lead | BASE + OPS | AT-NFR-09 | Planned |
| NFR-10 | R0 | Technical lead | BASE + OPS | AT-NFR-10 | Planned |
| NFR-11 | R0 | Technical lead | BASE + OPS | AT-NFR-11 | Planned |
| NFR-12 | R0 | Technical lead | BASE + OPS | AT-NFR-12 | Planned |
| INT-01 | R0 | Integration lead | AUTH + CASH where relevant | AT-INT-01 | Planned |
| INT-02 | R0 | Integration lead | AUTH + CASH where relevant | AT-INT-02 | Planned |
| INT-03 | R0 | Integration lead | AUTH + CASH where relevant | AT-INT-03 | Planned |
| INT-04 | R0 | Integration lead | AUTH + CASH where relevant | AT-INT-04 | Planned |
| INT-05 | R0 | Integration lead | AUTH + CASH where relevant | AT-INT-05 | Planned |
| INT-06 | R0 | Integration lead | AUTH + CASH where relevant | AT-INT-06 | Planned |
| CAL-01 | R0 | Time module lead | TIME + LEGAL | AT-CAL-01 | Planned |
| CAL-02 | R0 | Time module lead | TIME + LEGAL | AT-CAL-02 | Planned |
| CAL-03 | R0 | Time module lead | TIME + LEGAL | AT-CAL-03 | Planned |
| CAL-04 | R0 | Time module lead | TIME + LEGAL | AT-CAL-04 | Planned |
| CAL-05 | R0 | Time module lead | TIME + LEGAL | AT-CAL-05 | Planned |
| CAL-06 | R0 | Time module lead | TIME + LEGAL | AT-CAL-06 | Planned |
| CAL-07 | R0 | Time module lead | TIME + LEGAL | AT-CAL-07 | Planned |
| CAL-08 | R0 | Time module lead | TIME + LEGAL | AT-CAL-08 | Planned |
| CAL-09 | R1 | Time module lead | TIME + LEGAL | AT-CAL-09 | Planned |
| CAL-10 | R1 | Time module lead | TIME + LEGAL | AT-CAL-10 | Planned |
| CAL-11 | R1 | Time module lead | TIME + LEGAL | AT-CAL-11 | Planned |
| CAL-12 | R0 | Time module lead | TIME + LEGAL | AT-CAL-12 | Planned |
| CAL-13 | R0 | Time module lead | TIME + LEGAL | AT-CAL-13 | Planned |
| CAL-14 | R0 | Time module lead | TIME + LEGAL | AT-CAL-14 | Planned |
| CAL-15 | R0 | Time module lead | TIME + LEGAL | AT-CAL-15 | Planned |
| CAL-16 | R0 | Time module lead | TIME + LEGAL | AT-CAL-16 | Planned |
| CAL-17 | R0 | Time module lead | TIME + LEGAL | AT-CAL-17 | Planned |
| CAL-18 | R0 | Time module lead | TIME + LEGAL | AT-CAL-18 | Planned |
| CAL-19 | R0 | Time module lead | TIME + LEGAL | AT-CAL-19 | Planned |
| CAL-20 | R0 | Time module lead | TIME + LEGAL | AT-CAL-20 | Planned |
| CAL-21 | R1 | Time module lead | TIME + LEGAL | AT-CAL-21 | Planned |
| CAL-22 | R0 | Time module lead | TIME + LEGAL | AT-CAL-22 | Planned |
| HRP-01 | R1 | HR product owner | PEOPLE | AT-HRP-01 | Planned |
| HRP-02 | R1 | HR product owner | PEOPLE | AT-HRP-02 | Planned |
| HRP-03 | R1 | HR product owner | PEOPLE | AT-HRP-03 | Planned |
| HRP-04 | R1 | HR product owner | PEOPLE | AT-HRP-04 | Planned |
| HRP-05 | R2 | HR product owner | PEOPLE + EXPAND | AT-HRP-05 | Planned |
| HRP-06 | R2 | HR product owner | PEOPLE + EXPAND | AT-HRP-06 | Planned |
| HRP-07 | R1 | HR product owner | PEOPLE | AT-HRP-07 | Planned |
| HRP-08 | R1 | HR product owner | PEOPLE | AT-HRP-08 | Planned |
| HRP-09 | R0 | HR product owner | PEOPLE | AT-HRP-09 | Planned |
| HRP-10 | R0 | HR product owner | PEOPLE | AT-HRP-10 | Planned |
| HRP-11 | R0 | HR product owner | PEOPLE | AT-HRP-11 | Planned |
| HRP-12 | R1* | HR product owner | PEOPLE | AT-HRP-12 | Planned |
| HRP-13 | R0 | HR product owner | PEOPLE | AT-HRP-13 | Planned |
| HRP-14 | R1 | HR product owner | PEOPLE | AT-HRP-14 | Planned |
| HRP-15 | R1 | HR product owner | PEOPLE | AT-HRP-15 | Planned |
| HRP-16 | R1 | HR product owner | PEOPLE | AT-HRP-16 | Planned |
| HRP-17 | R1 | HR product owner | PEOPLE | AT-HRP-17 | Planned |
| HRP-18 | R1 | HR product owner | PEOPLE | AT-HRP-18 | Planned |
| HRP-19 | R2 | HR product owner | PEOPLE + EXPAND | AT-HRP-19 | Planned |
| HRP-20 | R1 | HR product owner | PEOPLE | AT-HRP-20 | Planned |
| HRP-21 | R0 | HR product owner | PEOPLE | AT-HRP-21 | Planned |
| HRP-22 | R1 | HR product owner | PEOPLE | AT-HRP-22 | Planned |
| HRP-23 | R0 | HR product owner | PEOPLE | AT-HRP-23 | Planned |
| HRP-24 | R0 | HR product owner | PEOPLE | AT-HRP-24 | Planned |
| HRP-25 | R0 | HR product owner | PEOPLE | AT-HRP-25 | Planned |
| HRP-26 | R0 | HR product owner | PEOPLE | AT-HRP-26 | Planned |
| HRP-27 | R0 | HR product owner | PEOPLE | AT-HRP-27 | Planned |
| HRP-28 | R0 | HR product owner | PEOPLE | AT-HRP-28 | Planned |
| HRP-29 | R0 | HR product owner | PEOPLE | AT-HRP-29 | Planned |
| HRP-30 | R0 | HR product owner | PEOPLE | AT-HRP-30 | Planned |
| DOC-01 | R0 | HR product owner | PEOPLE | AT-DOC-01 | Planned |
| DOC-02 | R0 | HR product owner | PEOPLE | AT-DOC-02 | Planned |
| DOC-03 | R0 | HR product owner | PEOPLE | AT-DOC-03 | Planned |
| DOC-04 | R0 | HR product owner | PEOPLE | AT-DOC-04 | Planned |
| DOC-05 | R0 | HR product owner | PEOPLE | AT-DOC-05 | Planned |
| DOC-06 | R0 | HR product owner | PEOPLE | AT-DOC-06 | Planned |
| DOC-07 | R0 | HR product owner | PEOPLE | AT-DOC-07 | Planned |
| DOC-08 | R0 | HR product owner | PEOPLE | AT-DOC-08 | Planned |
| DOC-09 | R1 | HR product owner | PEOPLE | AT-DOC-09 | Planned |
| DOC-10 | R2 | HR product owner | PEOPLE + EXPAND | AT-DOC-10 | Planned |
| DOC-11 | R0* | HR product owner | PEOPLE | AT-DOC-11 | Planned |
| DOC-12 | R0 | HR product owner | PEOPLE | AT-DOC-12 | Planned |
| DOC-13 | R1 | HR product owner | PEOPLE | AT-DOC-13 | Planned |
| DOC-14 | R0 | HR product owner | PEOPLE | AT-DOC-14 | Planned |
| DOC-15 | R1 | HR product owner | PEOPLE | AT-DOC-15 | Planned |
| DOC-16 | R1 | HR product owner | PEOPLE | AT-DOC-16 | Planned |
| DOC-17 | R0 | HR product owner | PEOPLE | AT-DOC-17 | Planned |
| DOC-18 | R0 | HR product owner | PEOPLE | AT-DOC-18 | Planned |
| DOC-19 | R0 | HR product owner | PEOPLE | AT-DOC-19 | Planned |
| DOC-20 | R0 | HR product owner | PEOPLE | AT-DOC-20 | Planned |
| DOC-21 | R0 | HR product owner | PEOPLE | AT-DOC-21 | Planned |
| DOC-22 | R0 | HR product owner | PEOPLE | AT-DOC-22 | Planned |
| DOC-23 | R0 | HR product owner | PEOPLE | AT-DOC-23 | Planned |
| RBAC-01 | R0 | Security lead | AUTH | AT-RBAC-01 | Planned |
| RBAC-02 | R0 | Security lead | AUTH | AT-RBAC-02 | Planned |
| RBAC-03 | R0 | Security lead | AUTH | AT-RBAC-03 | Planned |
| RBAC-04 | R0 | Security lead | AUTH | AT-RBAC-04 | Planned |
| RBAC-05 | R0 | Security lead | AUTH | AT-RBAC-05 | Planned |
| RBAC-06 | R0 | Security lead | AUTH | AT-RBAC-06 | Planned |
| RBAC-07 | R0 | Security lead | AUTH | AT-RBAC-07 | Planned |
| RBAC-08 | R0 | Security lead | AUTH | AT-RBAC-08 | Planned |
| RBAC-09 | R0 | Security lead | AUTH | AT-RBAC-09 | Planned |
| RBAC-10 | R0 | Security lead | AUTH | AT-RBAC-10 | Planned |
| RBAC-11 | R1 | Security lead | AUTH | AT-RBAC-11 | Planned |
| RBAC-12 | R1 | Security lead | AUTH | AT-RBAC-12 | Planned |
| RBAC-13 | R0 | Security lead | AUTH | AT-RBAC-13 | Planned |
| RBAC-14 | R0 | Security lead | AUTH | AT-RBAC-14 | Planned |
| RBAC-15 | R0 | Security lead | AUTH | AT-RBAC-15 | Planned |
| RBAC-16 | R0 | Security lead | AUTH | AT-RBAC-16 | Planned |
| RBAC-17 | R0 | Security lead | AUTH | AT-RBAC-17 | Planned |
| IAM-01 | R0 | Security lead | AUTH | AT-IAM-01 | Planned |
| IAM-02 | R0 | Security lead | AUTH | AT-IAM-02 | Planned |
| IAM-03 | R1 | Security lead | AUTH | AT-IAM-03 | Planned |
| IAM-04 | R0 | Security lead | AUTH | AT-IAM-04 | Planned |
| IAM-05 | R0 | Security lead | AUTH | AT-IAM-05 | Planned |
| IAM-06 | R0 | Security lead | AUTH | AT-IAM-06 | Planned |
| AUD-01 | R0 | Security lead | AUTH | AT-AUD-01 | Planned |
| AUD-02 | R0 | Security lead | AUTH | AT-AUD-02 | Planned |
| AUD-03 | R0 | Security lead | AUTH | AT-AUD-03 | Planned |
| AUD-04 | R0 | Security lead | AUTH | AT-AUD-04 | Planned |
| AUD-05 | R0 | Security lead | AUTH | AT-AUD-05 | Planned |
| AUD-06 | R0 | Security lead | AUTH | AT-AUD-06 | Planned |
| AUD-07 | R0 | Security lead | AUTH | AT-AUD-07 | Planned |
| AUD-08 | R0 | Security lead | AUTH | AT-AUD-08 | Planned |
| AUD-09 | R0 | Security lead | AUTH | AT-AUD-09 | Planned |
| AUD-10 | R0 | Security lead | AUTH | AT-AUD-10 | Planned |
| AUD-11 | R0 | Security lead | AUTH | AT-AUD-11 | Planned |
| AUD-12 | R1 | Security lead | AUTH | AT-AUD-12 | Planned |
| AUD-13 | R0 | Security lead | AUTH | AT-AUD-13 | Planned |
| AUD-14 | R1* | Security lead | AUTH | AT-AUD-14 | Planned |
| AUD-15 | R1 | Security lead | AUTH | AT-AUD-15 | Planned |
| AUD-16 | R1 | Security lead | AUTH | AT-AUD-16 | Planned |
| AUD-17 | R0 | Security lead | AUTH | AT-AUD-17 | Planned |
| RPT-01 | R0 | Reporting lead | INSIGHT | AT-RPT-01 | Planned |
| RPT-02 | R0 | Reporting lead | INSIGHT | AT-RPT-02 | Planned |
| RPT-03 | R0 | Reporting lead | INSIGHT | AT-RPT-03 | Planned |
| RPT-04 | R0 | Reporting lead | INSIGHT | AT-RPT-04 | Planned |
| RPT-05 | R0 | Reporting lead | INSIGHT | AT-RPT-05 | Planned |
| RPT-06 | R0 | Reporting lead | INSIGHT | AT-RPT-06 | Planned |
| RPT-07 | R0 | Reporting lead | INSIGHT | AT-RPT-07 | Planned |
| RPT-08 | R0 | Reporting lead | INSIGHT | AT-RPT-08 | Planned |
| RPT-09 | R1* | Reporting lead | INSIGHT | AT-RPT-09 | Planned |
| RPT-10 | R1 | Reporting lead | INSIGHT | AT-RPT-10 | Planned |
| RPT-11 | R1 | Reporting lead | INSIGHT | AT-RPT-11 | Planned |
| RPT-12 | R1* | Reporting lead | INSIGHT | AT-RPT-12 | Planned |
| RPT-13 | R0 | Reporting lead | INSIGHT | AT-RPT-13 | Planned |
| RPT-14 | R1 | Reporting lead | INSIGHT | AT-RPT-14 | Planned |
| RPT-15 | R0 | Reporting lead | INSIGHT | AT-RPT-15 | Planned |
| RPT-16 | R0 | Reporting lead | INSIGHT | AT-RPT-16 | Planned |
| RPT-17 | R0 | Reporting lead | INSIGHT | AT-RPT-17 | Planned |
| RPT-18 | R0 | Reporting lead | INSIGHT | AT-RPT-18 | Planned |
| RPT-19 | R0 | Reporting lead | INSIGHT | AT-RPT-19 | Planned |
| RPT-20 | R0 | Reporting lead | INSIGHT | AT-RPT-20 | Planned |
| PLT-01 | R0 | Platform product owner | AUTH + OPS | AT-PLT-01 | Planned |
| PLT-02 | R0 | Platform product owner | AUTH + OPS | AT-PLT-02 | Planned |
| PLT-03 | R0 | Platform product owner | AUTH + OPS | AT-PLT-03 | Planned |
| PLT-04 | R0 | Platform product owner | AUTH + OPS | AT-PLT-04 | Planned |
| PLT-05 | R0 | Platform product owner | AUTH + OPS | AT-PLT-05 | Planned |
| PLT-06 | R0 | Platform product owner | AUTH + OPS | AT-PLT-06 | Planned |
| PLT-07 | R0* | Platform product owner | AUTH + OPS | AT-PLT-07 | Planned |
| PLT-08 | R0 | Platform product owner | AUTH + OPS | AT-PLT-08 | Planned |
| PLT-09 | R0 | Platform product owner | AUTH + OPS | AT-PLT-09 | Planned |
| PLT-10 | R0 | Platform product owner | AUTH + OPS | AT-PLT-10 | Planned |
| PLT-11 | R0 | Platform product owner | AUTH + OPS | AT-PLT-11 | Planned |
| PLT-12 | R1 | Platform product owner | AUTH + OPS | AT-PLT-12 | Planned |
| PLT-13 | R1 | Platform product owner | AUTH + OPS | AT-PLT-13 | Planned |
| PLT-14 | R1* | Platform product owner | AUTH + OPS | AT-PLT-14 | Planned |
| PLT-15 | R1 | Platform product owner | AUTH + OPS | AT-PLT-15 | Planned |
| PLT-16 | R1* | Platform product owner | AUTH + OPS | AT-PLT-16 | Planned |
| PLT-17 | R1* | Platform product owner | AUTH + OPS | AT-PLT-17 | Planned |
| PLT-18 | R1 | Platform product owner | AUTH + OPS | AT-PLT-18 | Planned |
| PLT-19 | R1 | Platform product owner | AUTH + OPS | AT-PLT-19 | Planned |
| PLT-20 | R1 | Platform product owner | AUTH + OPS | AT-PLT-20 | Planned |
| PLT-21 | R1 | Platform product owner | AUTH + OPS | AT-PLT-21 | Planned |
| PLT-22 | R0 | Platform product owner | AUTH + OPS | AT-PLT-22 | Planned |
| PLT-23 | R1* | Platform product owner | AUTH + OPS | AT-PLT-23 | Planned |
| PLT-24 | R0 | Platform product owner | AUTH + OPS | AT-PLT-24 | Planned |
| PLT-25 | R0* | Platform product owner | AUTH + OPS | AT-PLT-25 | Planned |
| PLT-26 | R0 | Platform product owner | AUTH + OPS | AT-PLT-26 | Planned |
| PLT-27 | R1 | Platform product owner | AUTH + OPS | AT-PLT-27 | Planned |
| PLT-28 | R1 | Platform product owner | AUTH + OPS | AT-PLT-28 | Planned |
| PLT-29 | R0 | Platform product owner | AUTH + OPS | AT-PLT-29 | Planned |
| PLT-30 | R0* | Platform product owner | AUTH + OPS | AT-PLT-30 | Planned |
| PLT-31 | R0* | Platform product owner | AUTH + OPS | AT-PLT-31 | Planned |
| PLT-32 | R0* | Platform product owner | AUTH + OPS | AT-PLT-32 | Planned |
| PLT-33 | R0 | Platform product owner | AUTH + OPS | AT-PLT-33 | Planned |
| PLT-34 | R0 | Platform product owner | AUTH + OPS | AT-PLT-34 | Planned |
| PLT-35 | R0 | Platform product owner | AUTH + OPS | AT-PLT-35 | Planned |
| PRV-01 | R0 | Security lead | AUTH | AT-PRV-01 | Planned |
| PRV-02 | R0 | Security lead | AUTH | AT-PRV-02 | Planned |
| PRV-03 | R0 | Security lead | AUTH | AT-PRV-03 | Planned |
| PRV-04 | R0 | Security lead | AUTH | AT-PRV-04 | Planned |
| PRV-05 | R0 | Security lead | AUTH | AT-PRV-05 | Planned |
| PRV-06 | R0 | Security lead | AUTH | AT-PRV-06 | Planned |
| PRV-07 | R0 | Security lead | AUTH | AT-PRV-07 | Planned |
| PRV-08 | R0 | Security lead | AUTH | AT-PRV-08 | Planned |
| PRV-09 | R0 | Security lead | AUTH | AT-PRV-09 | Planned |
| PAY-15 | R0 | Payroll lead | PAY + LEGAL | AT-PAY-15 | Planned |
| PAY-16 | R0 | Payroll lead | PAY + LEGAL | AT-PAY-16 | Planned |
| PAY-17 | R0 | Payroll lead | PAY + LEGAL | AT-PAY-17 | Planned |
| PAY-18 | R0 | Payroll lead | PAY + LEGAL | AT-PAY-18 | Planned |
| PAY-19 | R0 | Payroll lead | PAY + LEGAL | AT-PAY-19 | Planned |
| PAY-20 | R0 | Payroll lead | PAY + LEGAL | AT-PAY-20 | Planned |
| PAY-21 | R0 | Payroll lead | PAY + LEGAL | AT-PAY-21 | Planned |
| PAY-22 | R0 | Payroll lead | PAY + LEGAL | AT-PAY-22 | Planned |
| PAY-23 | R0 | Payroll lead | PAY + LEGAL | AT-PAY-23 | Planned |
| PAY-24 | R0 | Payroll lead | PAY + LEGAL | AT-PAY-24 | Planned |
| OPS-01 | R0 | Payroll operations lead | PAY + CASH + OPS | AT-OPS-01 | Planned |
| OPS-02 | R0 | Payroll operations lead | PAY + CASH + OPS | AT-OPS-02 | Planned |
| OPS-03 | R0 | Payroll operations lead | PAY + CASH + OPS | AT-OPS-03 | Planned |
| OPS-04 | R0 | Payroll operations lead | PAY + CASH + OPS | AT-OPS-04 | Planned |
| OPS-05 | R0 | Payroll operations lead | PAY + CASH + OPS | AT-OPS-05 | Planned |
| OPS-06 | R0 | Payroll operations lead | PAY + CASH + OPS | AT-OPS-06 | Planned |
| OPS-07 | R0 | Payroll operations lead | PAY + CASH + OPS | AT-OPS-07 | Planned |
| OPS-08 | R0 | Payroll operations lead | PAY + CASH + OPS | AT-OPS-08 | Planned |
| EXP-01 | R0 | Quality lead | AUTH + OPS | AT-EXP-01 | Planned |
| EXP-02 | R1 | Quality lead | AUTH + OPS | AT-EXP-02 | Planned |
| EXP-03 | R0 | Quality lead | AUTH + OPS | AT-EXP-03 | Planned |
| EXP-04 | R0 | Quality lead | AUTH + OPS | AT-EXP-04 | Planned |
| EXP-05 | R0 | Quality lead | AUTH + OPS | AT-EXP-05 | Planned |
| EXP-06 | R0 | Quality lead | AUTH + OPS | AT-EXP-06 | Planned |
| EXP-07 | R1# | Quality lead | AUTH + OPS | AT-EXP-07 | Planned |
| EXP-08 | R0 | Quality lead | AUTH + OPS | AT-EXP-08 | Planned |
| WFP-01 | R2 | HR product owner | PEOPLE + EXPAND | AT-WFP-01 | Planned |
| WFP-02 | R2 | HR product owner | PEOPLE + EXPAND | AT-WFP-02 | Planned |
| WFP-03 | R2 | HR product owner | PEOPLE + EXPAND | AT-WFP-03 | Planned |
| WFP-04 | R2 | HR product owner | PEOPLE + EXPAND | AT-WFP-04 | Planned |
| GOV-01 | R0 | Product owner | BASE + LEGAL where relevant | AT-GOV-01 | Planned |
| GOV-02 | R0 | Product owner | BASE + LEGAL where relevant | AT-GOV-02 | Planned |
| GOV-03 | R0 | Product owner | BASE + LEGAL where relevant | AT-GOV-03 | Planned |
| GOV-04 | R0 | Product owner | BASE + LEGAL where relevant | AT-GOV-04 | Planned |
| GOV-05 | R0 | Product owner | BASE + LEGAL where relevant | AT-GOV-05 | Planned |
| GOV-06 | R0 | Product owner | BASE + LEGAL where relevant | AT-GOV-06 | Planned |
| GOV-07 | R0 | Product owner | BASE + LEGAL where relevant | AT-GOV-07 | Planned |
| GOV-08 | R0 | Product owner | BASE + LEGAL where relevant | AT-GOV-08 | Planned |


### F.1 Explicit split scope and launch prerequisites

- `PER-02`: goals, competencies and manager/self review at R1; richer peer/360 configuration at R2.
- `HRP-12`: approved recruitment handoff at R1; built-in requisition/offer tooling at R2. External handoff remains supported.
- `DOC-11`: secure upload/preview at R0; editing tools such as page reordering and rotation/redaction workspace at R2. Restrict visibility or create a separately approved redacted copy through the controlled document process until then.
- `RPT-09`: typed governed report builder at R1; advanced pivots and conditional-formatting UI at R2.
- `RPT-12`: metrics for delivered core functions at R1; recruiting/training metrics at R2 when their source modules exist. Do not fabricate unavailable metrics.
- `PLT-07`: in-app/email mandatory notices and preference controls at R0; optional SMS/WhatsApp integrations at R2. PWA push follows the tested device matrix.
- `PLT-14`: health/catalogue UI for initial supported bank, attendance and accounting adapters at R1; open marketplace ecosystem at R2. Required pilot adapters are R0 prerequisites.
- PLT-16 and PLT-17: typed fields, forms and controlled approval configuration at R1; elaborate visual builder and generalized automation studio at R2. R0 required workflows remain explicitly configured, versioned and tested.
- `PLT-23`: Unicode data, required Bangla/English payslips and transactional templates at R0; complete Bangla/English UI at R1; optional calendar display enhancements may be R2. Gregorian legal/business dates remain authoritative.
- `PLT-25`: any attendance method used by a pilot must satisfy EXP-04/05 at R0; advanced selfie/geofence/spoof detection features are R2 unless a specifically approved cohort requires them.
- `PLT-30`: multi-zone design, backup/recovery and tested targets at R0; multi-region expansion at R2 subject to residency, consistency and cost review.
- `PLT-31`: threat modeling, secure development, vulnerability handling and pre-launch independent testing at R0; a funded public bug-bounty program may follow at R2. A disclosure channel and remediation ownership remain mandatory.
- `PLT-32`: honest security/trust documentation and relevant operating controls at R0; third-party certifications/attestations at R2 after evidence and commercial readiness. Never claim certification prematurely.
- `AUD-14`: support a scoped enterprise audit export at R1 when contracted; richer SIEM adapters at R2. Core audit capture/integrity remains R0.
- `EXP-07`: full sensitive self-service analytics safeguards at R1; before R0, restrict sensitive reports to reviewed fixed queries/authorized recipients with suppression and no arbitrary drill-down. Do not expose an inference-prone builder early.
- HRP-09, HRP-10 and HRP-11: the applicable grievance, disciplinary and safety procedures for the pilot must be available at R0, including a controlled evidence-backed workflow if advanced screens are not yet built. Do not defer an employer obligation by treating it as a future people-service feature.

- `CAL-09`, `CAL-10`, `CAL-11`, `CAL-21`, `HRP-07`, `DOC-13`, `DOC-16`, `AUD-15`, `PLT-28`: moved from R0 to R1 in v3.1 to keep the pilot scope deliverable. Until R1: optional holidays, team calendar views, calendar feeds and shift rostering use the base calendar and manual roster import; welfare enrolment runs outside the product; documents requiring signature use a scanned wet signature recorded under DOC-13 rules in a controlled upload; policy acknowledgements use the standard acknowledgement record; security alerts are limited to mandatory failed login, privileged role change and payroll approval alerts delivered by the base notification service; bulk file updates are limited to approved import batches. A cohort or law that requires any of these earlier overrides this deferral (GOV-08).

### F.2 Delivery completeness rule

Core permissions, privacy, safe data access, incident response and financial invariants apply at the first release that processes the relevant data; later reporting or workflow interfaces do not defer those controls. The matrix is not a substitute for applicability review. Any feature activated ahead of its assigned release must pass its dependencies and acceptance tests first.
