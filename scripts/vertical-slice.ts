/**
 * Section 19 step 2 vertical slice, entirely synthetic and in memory:
 *   tenant → employee → salary snapshot → synthetic calculation → draft payslip
 *
 * Uses the Appendix B TEST ONLY pack, so every output is watermarked and the
 * production path is shown being refused. Run: `pnpm demo:slice`.
 */
import { readFileSync } from "node:fs";
import {
  decimalString,
  isoDate,
  type EmploymentId,
  type LegalEntityId,
  type PayGroupId,
  type PersonId,
  type TenantId,
  type UtcTimestamp,
} from "@peopleledger/contracts";
import { assertTenant, type LegalEntity, type Tenant } from "@peopleledger/platform";
import { appendVersion, versionAsOf, type CompensationAgreement, type Employment, type Person } from "@peopleledger/people";
import {
  buildDraftPayslip,
  calculatePayroll,
  Dec,
  parseSalaryTaxRulePack,
  renderPayslipText,
  type PayrollCalculationSnapshot,
  type PolicyPack,
} from "@peopleledger/pay";

const tenant: Tenant = { id: "tnt_demo" as TenantId, name: "Synthetic Software Ltd (demo)", environment: "sandbox" };
const entity: LegalEntity = {
  id: "ent_demo_1" as LegalEntityId,
  tenantId: tenant.id,
  legalName: { en: "Synthetic Software Ltd", bn: "সিনথেটিক সফটওয়্যার লিমিটেড" },
  productionPayrollEnabled: false,
};
const person: Person = { id: "per_demo_1" as PersonId, tenantId: tenant.id, legalName: { en: "Test Employee One", bn: "পরীক্ষা কর্মী এক" } };
const employment: Employment = {
  id: "emp_demo_1" as EmploymentId,
  tenantId: tenant.id,
  personId: person.id,
  legalEntityId: entity.id,
  employeeCode: "E-0001",
  hireDate: isoDate("2026-07-01"),
};

const recordedAt = "2026-06-25T04:00:00Z" as UtcTimestamp;
const line = (code: string, en: string, bn: string, amount: string) => ({ componentCode: code, label: { en, bn }, monthlyAmount: decimalString(amount) });
let history = appendVersion([], {
  effectiveFrom: isoDate("2026-07-01"),
  recordedAt,
  recordedBy: "hr@example.test",
  value: [line("BASIC", "Basic salary", "মূল বেতন", "60000"), line("HRA", "House rent allowance", "বাড়ি ভাড়া ভাতা", "30000"), line("MED", "Medical allowance", "চিকিৎসা ভাতা", "10000")],
});
// Mid-year raise from January, appended without rewriting July–December history (PRN-05).
history = appendVersion(history, {
  effectiveFrom: isoDate("2027-01-01"),
  recordedAt: "2026-12-20T04:00:00Z" as UtcTimestamp,
  recordedBy: "hr@example.test",
  value: [line("BASIC", "Basic salary", "মূল বেতন", "72000"), line("HRA", "House rent allowance", "বাড়ি ভাড়া ভাতা", "36000"), line("MED", "Medical allowance", "চিকিৎসা ভাতা", "12000")],
});
const compensation: CompensationAgreement = { employmentId: employment.id, tenantId: tenant.id, versions: history };

const pack = parseSalaryTaxRulePack(JSON.parse(readFileSync(new URL("../tests/fixtures/rule-packs/BD-INCOME-TAX-SALARY.FA2026-draft-1.TEST-ONLY.json", import.meta.url), "utf8")));
const policy: PolicyPack = { policyId: "POL-DEMO", version: "1", tenantId: tenant.id };

const months = Array.from({ length: 12 }, (_, i) => {
  const y = i < 6 ? 2026 : 2027;
  const m = ((i + 6) % 12) + 1;
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { start: isoDate(start), end: isoDate(end) };
});

function snapshotFor(index: number, ytdTaxable: string, ytdWithheld: string, mode: "test" | "production"): PayrollCalculationSnapshot {
  assertTenant(tenant.id, employment);
  assertTenant(tenant.id, compensation);
  const period = months[index]!;
  const current = versionAsOf(compensation.versions, period.end);
  if (!current) throw new Error(`No compensation in force for ${period.end}`);
  const monthlyTotal = current.value.reduce((s, l) => s.plus(l.monthlyAmount), new Dec(0)).toFixed();
  return {
    snapshotId: `run-${period.start.slice(0, 7)}-${employment.employeeCode}`,
    mode,
    tenantId: tenant.id,
    legalEntityId: entity.id,
    payGroupId: "pg_monthly" as PayGroupId,
    employmentId: employment.id,
    period: { ...period, paymentDate: period.end, incomeYearStart: isoDate("2026-07-01"), incomeYearEnd: isoDate("2027-06-30") },
    employee: { residency: "resident", payFrequency: "monthly", currency: "BDT", categoryClaims: [{ category: "general", evidenceStatus: "not-required" }] },
    // Synthetic simplification: every component treated as taxable salary. Real
    // component tax mappings come from an approved pack (TAX-05).
    earnings: current.value.map((l) => ({ componentCode: l.componentCode, label: l.label, amount: l.monthlyAmount, taxTreatment: "salary-taxable" as const })),
    projection: {
      remainingRegularPeriodsAfterThis: 11 - index,
      projectedTaxablePerRemainingPeriod: decimalString(monthlyTotal),
      expectedAdditionalTaxable: decimalString("0"),
      assumptions: ["Pay in force at period end continues; no bonus expected (synthetic)."],
    },
    yearToDate: { taxableSalary: decimalString(ytdTaxable), taxWithheld: decimalString(ytdWithheld) },
  };
}

let ytdTaxable = new Dec(0);
let ytdWithheld = new Dec(0);
console.log("Month     Gross        TDS          Net          Projected annual tax");
for (let i = 0; i < 12; i++) {
  const snap = snapshotFor(i, ytdTaxable.toFixed(), ytdWithheld.toFixed(), "test");
  const result = calculatePayroll(snap, pack, policy);
  if (result.status !== "calculated" || !result.amounts) throw new Error(JSON.stringify(result.blockingErrors));
  const a = result.amounts;
  console.log(`${snap.period.start.slice(0, 7)}   ${a.grossPay.padStart(10)}   ${a.periodWithholding.padStart(10)}   ${a.netPay.padStart(10)}   ${a.projectedAnnualTax.padStart(10)}`);
  if (i === 6) {
    const slip = buildDraftPayslip(snap, result, { entityName: entity.legalName.en, employeeName: person.legalName, employeeCode: employment.employeeCode, revision: 1 });
    console.log(`\n${renderPayslipText(slip, "en")}\n\n${renderPayslipText(slip, "bn")}\n`);
  }
  ytdTaxable = ytdTaxable.plus(a.grossPay);
  ytdWithheld = ytdWithheld.plus(a.periodWithholding);
}
console.log(`\nIncome year totals: taxable ${ytdTaxable.toFixed(2)}, withheld ${ytdWithheld.toFixed(2)}`);

const refused = calculatePayroll(snapshotFor(0, "0", "0", "production"), pack, policy);
console.log(`\nProduction attempt with the TEST ONLY pack: ${refused.status}`);
for (const e of refused.blockingErrors.slice(0, 4)) console.log(`  - ${e.code}: ${e.message}`);
if (refused.blockingErrors.length > 4) console.log(`  … and ${refused.blockingErrors.length - 4} more`);
