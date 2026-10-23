import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  decimalString,
  isoDate,
  type EmploymentId,
  type LegalEntityId,
  type PayGroupId,
  type TenantId,
} from "@peopleledger/contracts";
import {
  parseSalaryTaxRulePack,
  rulePackContentHash,
  type CategoryClaim,
  type PayrollCalculationSnapshot,
  type PolicyPack,
  type RuleApproval,
  type SalaryTaxRulePack,
} from "../src/index.js";

const fixture = fileURLToPath(
  new URL("../../../tests/fixtures/rule-packs/BD-INCOME-TAX-SALARY.FA2026-draft-1.TEST-ONLY.json", import.meta.url),
);

/** The Appendix B TEST ONLY pack, loaded through the same parser production data uses. */
export function loadTestPack(): SalaryTaxRulePack {
  return parseSalaryTaxRulePack(JSON.parse(readFileSync(fixture, "utf8")));
}

export const TENANT = "tnt_synthetic_a" as TenantId;

export const POLICY: PolicyPack = { policyId: "POL-DEFAULT", version: "1", tenantId: TENANT };

export interface SnapshotOptions {
  monthlyGross: string;
  periodIndex?: number; // 1 = July
  ytdTaxable?: string;
  ytdWithheld?: string;
  projectedPerRemaining?: string;
  claims?: CategoryClaim[];
  mode?: "test" | "production";
  residency?: "resident" | "non-resident" | "undetermined";
}

const MONTH_STARTS = [
  "2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01", "2026-11-01", "2026-12-01",
  "2027-01-01", "2027-02-01", "2027-03-01", "2027-04-01", "2027-05-01", "2027-06-01",
];
const MONTH_ENDS = [
  "2026-07-31", "2026-08-31", "2026-09-30", "2026-10-31", "2026-11-30", "2026-12-31",
  "2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30", "2027-05-31", "2027-06-30",
];

/** Synthetic single-component monthly snapshot (NFR-12: no real employee data). */
export function snapshot(o: SnapshotOptions): PayrollCalculationSnapshot {
  const idx = o.periodIndex ?? 1;
  return {
    snapshotId: `snap-${idx}-${o.monthlyGross}`,
    mode: o.mode ?? "test",
    tenantId: TENANT,
    legalEntityId: "ent_synthetic_1" as LegalEntityId,
    payGroupId: "pg_monthly" as PayGroupId,
    employmentId: "emp_synthetic_1" as EmploymentId,
    period: {
      start: isoDate(MONTH_STARTS[idx - 1]!),
      end: isoDate(MONTH_ENDS[idx - 1]!),
      paymentDate: isoDate(MONTH_ENDS[idx - 1]!),
      incomeYearStart: isoDate("2026-07-01"),
      incomeYearEnd: isoDate("2027-06-30"),
    },
    employee: {
      residency: o.residency ?? "resident",
      payFrequency: "monthly",
      currency: "BDT",
      categoryClaims: o.claims ?? [{ category: "general", evidenceStatus: "not-required" }],
    },
    earnings: [
      {
        componentCode: "BASIC",
        label: { en: "Basic salary", bn: "মূল বেতন" },
        amount: decimalString(o.monthlyGross),
        taxTreatment: "salary-taxable",
      },
    ],
    projection: {
      remainingRegularPeriodsAfterThis: 12 - idx,
      projectedTaxablePerRemainingPeriod: decimalString(o.projectedPerRemaining ?? o.monthlyGross),
      expectedAdditionalTaxable: decimalString("0"),
      assumptions: ["Current monthly pay continues for the rest of the income year."],
    },
    yearToDate: {
      taxableSalary: decimalString(o.ytdTaxable ?? "0"),
      taxWithheld: decimalString(o.ytdWithheld ?? "0"),
    },
  };
}

/**
 * A synthetic pack that has passed every governance step. Its numbers are the
 * same unverified candidates; only the evidence/approval records differ, so it
 * exercises the gate without claiming any real legal approval.
 */
export function syntheticApprovedPack(author = "author@example.test"): SalaryTaxRulePack {
  const base = loadTestPack();
  const verified = { grade: "A" as const, sourceTitle: "SYNTHETIC TEST SOURCE", reviewer: "practitioner@example.test" };
  const params = Object.fromEntries(
    Object.entries(base.parameters).map(([k, v]) => [k, { ...v, evidence: verified, openItems: [] }]),
  ) as unknown as SalaryTaxRulePack["parameters"];
  const unsigned: SalaryTaxRulePack = {
    ...base,
    version: "SYNTHETIC-approved-1",
    testOnly: false,
    author,
    assessmentYearLabel: { value: "SYNTHETIC", evidence: verified, openItems: [] },
    parameters: params,
    status: "active",
    approvals: [],
  };
  return withApprovals(unsigned, "independent@example.test");
}

export function withApprovals(pack: SalaryTaxRulePack, independentApprover: string): SalaryTaxRulePack {
  const contentHash = rulePackContentHash(pack);
  const approval = (stage: RuleApproval["stage"], actor: string, role: RuleApproval["role"]): RuleApproval => ({
    stage,
    actor,
    role,
    decidedAt: "2026-06-30T00:00:00Z",
    rationale: "synthetic",
    contentHash,
  });
  return {
    ...pack,
    approvals: [
      approval("source-verified", "practitioner@example.test", "tax-practitioner"),
      approval("practitioner-reviewed", "practitioner@example.test", "tax-practitioner"),
      approval("tested", "qa@example.test", "qa"),
      approval("independently-approved", independentApprover, "independent-approver"),
    ],
  };
}
