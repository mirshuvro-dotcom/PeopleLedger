# Legal source register and open items

Requirements: Section 11.1, LAW-02, LAW-08, GOV-05. Source: Appendix C of the baseline.

**Nothing in this repository is verified law.** Each item below blocks the scenarios it affects until a named
owner closes it with a primary-source citation, a decision, a date and a test. Owners are roles until Phase 0
assigns people.

## Primary instruments to acquire (L-27)

| Instrument | Status | Retained copy | Hash |
|---|---|---|---|
| Income Tax Act 2023 as amended by Finance Act 2026 | Not acquired | — | — |
| Tax Deducted at Source Rules 2026 | Not acquired | — | — |
| Bangladesh Labour Act 2006 as amended (Ordinance 2025, Act 43 of 2026) | Not acquired | — | — |
| Bangladesh Labour Rules 2015 as amended Feb 2026 | Not acquired | — | — |
| NBR SROs, circulars, forms for 2026–27 | Not acquired | — | — |

Discovery links (not citations): https://bdlaws.minlaw.gov.bd/act-1672.html, https://bdlaws.minlaw.gov.bd/act-952.html,
https://nbr.gov.bd/acts/income-tax/eng, https://nbr.gov.bd/taxtypes/income-tax/income-tax-paripatra/eng,
https://nbr.gov.bd/publications/income-tax/eng.

## Open items and what they block in code

| ID | Item | Status | Owner (role) | Blocks in code today |
|---|---|---|---|---|
| L-01 | Salary TDS return frequency and form | Conflicting | Tax practitioner | Not modelled yet (statutory outputs) |
| L-02 | TDS deposit deadlines incl. June / year end | Unconfirmed | Tax practitioner | Not modelled yet (remittances) |
| L-03 | Penalty for failure to deduct / deposit | Conflicting | Tax practitioner | Not modelled yet |
| L-04 | Higher rate for missing return proof on salary | Unconfirmed | Tax practitioner | Not modelled; must block when built |
| L-05 | Tk 50,000 relief for disabled dependants | Unconfirmed | Tax practitioner | Category not offered (EMP-07) |
| L-06 | Holiday rollover of statutory due dates | Unconfirmed | Counsel | Not modelled yet (CAL-16) |
| L-07 | Perquisite valuation | Unconfirmed | Tax practitioner | Non-salary components → `UNSUPPORTED_TAX_TREATMENT` |
| L-08 | Festival holidays count/treatment | Conflicting | Labour lawyer | Not modelled yet (CAL-08) |
| L-09 | Net wealth / environmental surcharge | Unconfirmed | Tax practitioner | Not modelled; not applied |
| L-10 | Non-resident salary rate | Unconfirmed | Tax practitioner | Non-residents → `UNSUPPORTED_RESIDENCY` |
| L-11 | Wage payment deadlines | Unconfirmed | Labour lawyer | Not modelled yet (PAY-15) |
| L-12 | Provident fund mandate | Unconfirmed | Labour lawyer | Not modelled yet |
| L-13 | Gratuity tiers | Unconfirmed | Labour lawyer | Not modelled yet |
| L-14 | WPPF thresholds/split | Unconfirmed | Labour lawyer | Not modelled yet |
| L-15 | Maternity/paternity after amendment | Conflicting | Labour lawyer | Not modelled yet |
| L-16 | Overtime caps/base | Unconfirmed | Labour lawyer | Not modelled yet |
| L-17 | Minimum wage orders for cohort | Unconfirmed | Labour lawyer | Not modelled yet |
| L-18 | Indigenous salary exemption | Unconfirmed | Tax practitioner | Category not offered |
| L-19 | Investment rebate formula | Conflicting | Tax practitioner | Rebate not applied by engine |
| L-20 | Early filing incentive | Unconfirmed | Tax practitioner | Not applicable at employer |
| L-21 | Minimum tax for new taxpayers | Conflicting | Tax practitioner | Not applied at employer (B.3) |
| L-22 | E-signature sufficiency | Unconfirmed | Counsel | Not modelled yet (DOC-13) |
| L-23 | Data protection law status | Unconfirmed | Counsel | Hosting/privacy decisions pending |
| L-24 | Festival bonus obligation | Unconfirmed | Labour lawyer | Not modelled yet (PAY-17) |
| L-25 | Assessment year labelling | Unconfirmed | Tax practitioner | `assessmentYearLabel` open item → production blocked |
| L-26 | Monthly TDS rounding | Unconfirmed | Tax practitioner | Both rounding parameters open → production blocked |
| L-27 | Primary text acquisition | Open | Product owner | Every TEST ONLY parameter carries L-27 |

## Review log (LAW-08)

| Date | Reviewer | Sources checked | Changes found | Outcome |
|---|---|---|---|---|
| — | — | — | — | No review recorded yet |
