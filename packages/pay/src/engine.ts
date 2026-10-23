import type {
  DecimalString,
  EmploymentId,
  IsoDate,
  Issue,
  LegalEntityId,
  PayGroupId,
  TenantId,
} from "@peopleledger/contracts";
import { canonicalHash } from "./canonical.js";
import { Dec, dec, max, min, roundWith, sum, toDecimalString } from "./money.js";
import {
  packRef,
  productionAssignabilityIssues,
  rulePackContentHash,
  structuralIssues,
  type SalaryTaxRulePack,
  type TaxCategory,
} from "./rule-pack.js";

/** Bump the major version whenever a change could alter any output for the same input (LAW-09). */
export const ENGINE_VERSION = "1.0.0";

export type RunMode = "production" | "test";

/**
 * How a pay component is treated for salary tax. Only treatments the engine and
 * pack explicitly support are calculated; anything else blocks (TAX-05).
 */
export type TaxTreatment = "salary-taxable" | "unsupported";

export interface EarningLine {
  readonly componentCode: string;
  readonly label: { readonly en: string; readonly bn: string };
  readonly amount: DecimalString;
  readonly taxTreatment: TaxTreatment;
}

export interface CategoryClaim {
  readonly category: TaxCategory;
  /** `not-required` only applies to `general`. Unreviewed uploads are not evidence (DOC-05). */
  readonly evidenceStatus: "verified" | "pending" | "rejected" | "expired" | "not-required";
}

/**
 * Everything the calculation may read, frozen for one run revision (PAY-06).
 * The engine never reads the clock, tenant configuration or remote services;
 * if a value is needed it must be in here.
 */
export interface PayrollCalculationSnapshot {
  readonly snapshotId: string;
  readonly mode: RunMode;
  readonly tenantId: TenantId;
  readonly legalEntityId: LegalEntityId;
  readonly payGroupId: PayGroupId;
  readonly employmentId: EmploymentId;
  readonly period: {
    readonly start: IsoDate;
    readonly end: IsoDate;
    readonly paymentDate: IsoDate;
    readonly incomeYearStart: IsoDate;
    readonly incomeYearEnd: IsoDate;
  };
  readonly employee: {
    readonly residency: "resident" | "non-resident" | "undetermined";
    readonly payFrequency: "monthly";
    readonly currency: "BDT";
    readonly categoryClaims: readonly CategoryClaim[];
  };
  readonly earnings: readonly EarningLine[];
  /**
   * Visible, approved projection assumptions (TAX-08). The engine does not
   * invent future pay; it uses exactly these figures.
   */
  readonly projection: {
    readonly remainingRegularPeriodsAfterThis: number;
    readonly projectedTaxablePerRemainingPeriod: DecimalString;
    readonly expectedAdditionalTaxable: DecimalString;
    readonly assumptions: readonly string[];
  };
  readonly yearToDate: {
    /** Taxable salary already paid in this income year, excluding this period. */
    readonly taxableSalary: DecimalString;
    /** Salary tax already withheld by this employer in this income year. */
    readonly taxWithheld: DecimalString;
  };
}

/**
 * Employer policy pack (PRN-02, ORG-07). It may add lawful benefits later but
 * has no field that can override a legal parameter. Kept minimal for the slice.
 */
export interface PolicyPack {
  readonly policyId: string;
  readonly version: string;
  readonly tenantId: TenantId;
}

export interface TraceStep {
  readonly step: string;
  /** `pack@version#parameter` or `engine@version#mechanism`. */
  readonly rule: string;
  readonly inputs: Readonly<Record<string, string>>;
  readonly output: string;
}

export interface LedgerDraftLine {
  readonly account: "salary-expense" | "net-pay-payable" | "salary-tax-payable";
  readonly debit: DecimalString;
  readonly credit: DecimalString;
}

export interface CalculatedAmounts {
  readonly earnings: readonly EarningLine[];
  readonly grossPay: DecimalString;
  readonly appliedCategory: TaxCategory;
  readonly projectedAnnualTaxableIncome: DecimalString;
  readonly salaryExemption: DecimalString;
  readonly taxableIncome: DecimalString;
  readonly projectedAnnualTax: DecimalString;
  readonly periodWithholding: DecimalString;
  readonly deductions: readonly { readonly code: "salary-tds"; readonly amount: DecimalString }[];
  readonly netPay: DecimalString;
  readonly ledgerDraft: readonly LedgerDraftLine[];
}

export interface PayrollCalculationResult {
  readonly status: "calculated" | "blocked";
  readonly snapshotId: string;
  readonly engineVersion: string;
  readonly legalPack: { readonly ref: string; readonly contentHash: string; readonly testOnly: boolean };
  readonly policyPack: { readonly ref: string };
  /** True when the pack or run mode is test-only; outputs must be watermarked and never paid. */
  readonly testOnly: boolean;
  readonly amounts: CalculatedAmounts | null;
  readonly ruleTrace: readonly TraceStep[];
  readonly warnings: readonly Issue[];
  readonly blockingErrors: readonly Issue[];
  /** sha256 over the canonical form of every other field (Section 14.3). */
  readonly traceHash: string;
}

/**
 * Section 14.3 calculation contract. Pure and deterministic: identical inputs
 * and versions produce identical outputs and trace hash.
 */
export function calculatePayroll(
  snapshot: PayrollCalculationSnapshot,
  legalPack: SalaryTaxRulePack,
  policyPack: PolicyPack,
  engineVersion: string = ENGINE_VERSION,
): PayrollCalculationResult {
  const blocking: Issue[] = [];
  const warnings: Issue[] = [];
  const trace: TraceStep[] = [];
  const pref = packRef(legalPack);
  const block = (code: string, message: string, refs: string[], owner?: string) =>
    blocking.push(owner ? { code, severity: "blocking", message, refs, owner } : { code, severity: "blocking", message, refs });

  // --- Applicability gates (TAX-04, LAW-05, TAX-11, Section 1.2) -------------
  blocking.push(...structuralIssues(legalPack));

  if (engineVersion !== ENGINE_VERSION) {
    block("ENGINE_VERSION_UNAVAILABLE", `Engine ${engineVersion} is not this artifact (${ENGINE_VERSION}); reproduce with the original engine artifact.`, ["LAW-09"]);
  }
  const engineMajor = engineVersion.split(".")[0] ?? "";
  if (!legalPack.engineCompatibility.includes(engineMajor)) {
    block("RULE_PACK_ENGINE_INCOMPATIBLE", `${pref} does not declare compatibility with engine major ${engineMajor}.`, ["GOV-06"]);
  }
  if (snapshot.mode === "production") {
    blocking.push(...productionAssignabilityIssues(legalPack));
  }
  if (policyPack.tenantId !== snapshot.tenantId) {
    block("POLICY_PACK_TENANT_MISMATCH", "Policy pack belongs to a different tenant.", ["PRN-07"]);
  }
  if (
    legalPack.incomeYear.start !== snapshot.period.incomeYearStart ||
    legalPack.incomeYear.end !== snapshot.period.incomeYearEnd
  ) {
    block("RULE_PACK_INCOME_YEAR_MISMATCH", `${pref} covers ${legalPack.incomeYear.start}..${legalPack.incomeYear.end}, not the snapshot income year.`, ["ORG-04", "TAX-04", "AC-17"]);
  }
  if (snapshot.period.start < snapshot.period.incomeYearStart || snapshot.period.end > snapshot.period.incomeYearEnd || snapshot.period.start > snapshot.period.end) {
    block("PERIOD_OUTSIDE_INCOME_YEAR", "Pay period must fall inside its income year.", ["ORG-04"]);
  }
  if (snapshot.employee.residency === "undetermined") {
    block("RESIDENCY_UNDETERMINED", "Tax residency has not been determined.", ["TAX-04", "TAX-11"], "Payroll preparer");
  } else if (!legalPack.supportedScope.residency.includes(snapshot.employee.residency)) {
    block("UNSUPPORTED_RESIDENCY", `${pref} has no reviewed treatment for ${snapshot.employee.residency} employees.`, ["TAX-11", "Section 1.2"], "Tax practitioner");
  }
  if (!legalPack.supportedScope.payFrequency.includes(snapshot.employee.payFrequency)) {
    block("UNSUPPORTED_PAY_FREQUENCY", "Pay frequency is outside the pack scope.", ["Section 1.4"]);
  }
  if (!legalPack.supportedScope.currency.includes(snapshot.employee.currency)) {
    block("UNSUPPORTED_CURRENCY", "Currency is outside the pack scope.", ["TAX-10", "Section 1.4"]);
  }
  for (const line of snapshot.earnings) {
    if (line.taxTreatment !== "salary-taxable") {
      block("UNSUPPORTED_TAX_TREATMENT", `Component ${line.componentCode} has no reviewed tax treatment.`, ["TAX-05", "AC-15"], "Tax practitioner");
    }
    if (dec(line.amount).isNegative()) {
      block("NEGATIVE_EARNING", `Component ${line.componentCode} is negative; use a linked adjustment instead.`, ["PRN-04"]);
    }
  }
  const { remainingRegularPeriodsAfterThis } = snapshot.projection;
  if (!Number.isInteger(remainingRegularPeriodsAfterThis) || remainingRegularPeriodsAfterThis < 0) {
    block("INVALID_PROJECTION", "Remaining regular periods must be a non-negative integer.", ["TAX-08", "TAX-09"]);
  }

  const appliedCategory = resolveCategory(snapshot.employee.categoryClaims, legalPack, block);

  if (blocking.length > 0 || appliedCategory === null) {
    return finish(snapshot, legalPack, policyPack, engineVersion, null, trace, warnings, blocking);
  }

  // --- Calculation (TAX-06, TAX-08, TAX-09) ---------------------------------
  const p = legalPack.parameters;
  const at = (param: string) => `${pref}#${param}`;
  const engineRule = (mechanism: string) => `engine@${engineVersion}#${mechanism}`;

  const grossPay = sum(snapshot.earnings.map((e) => dec(e.amount)));
  trace.push({ step: "gross-pay", rule: engineRule("sum-earnings"), inputs: Object.fromEntries(snapshot.earnings.map((e) => [e.componentCode, e.amount])), output: grossPay.toFixed() });

  const ytdTaxable = dec(snapshot.yearToDate.taxableSalary);
  const remainingProjected = dec(snapshot.projection.projectedTaxablePerRemainingPeriod).times(remainingRegularPeriodsAfterThis);
  const additional = dec(snapshot.projection.expectedAdditionalTaxable);
  const annualIncome = ytdTaxable.plus(grossPay).plus(remainingProjected).plus(additional);
  trace.push({
    step: "projected-annual-taxable-income",
    rule: engineRule("ytd+current+projection"),
    inputs: {
      yearToDate: ytdTaxable.toFixed(),
      currentPeriod: grossPay.toFixed(),
      remainingPeriods: String(remainingRegularPeriodsAfterThis),
      perRemainingPeriod: snapshot.projection.projectedTaxablePerRemainingPeriod,
      expectedAdditional: additional.toFixed(),
    },
    output: annualIncome.toFixed(),
  });

  const ex = p.salaryExemption.value;
  const exemption = min(annualIncome.times(ex.fractionNumerator).dividedBy(ex.fractionDenominator), dec(ex.cap));
  trace.push({ step: "salary-exemption", rule: at("salaryExemption"), inputs: { income: annualIncome.toFixed(), fraction: `${ex.fractionNumerator}/${ex.fractionDenominator}`, cap: ex.cap }, output: exemption.toFixed() });

  const taxable = max(annualIncome.minus(exemption), new Dec(0));
  trace.push({ step: "taxable-income", rule: engineRule("income-minus-exemption"), inputs: { income: annualIncome.toFixed(), exemption: exemption.toFixed() }, output: taxable.toFixed() });

  const threshold = dec(p.taxFreeThresholds.value[appliedCategory] as DecimalString);
  trace.push({ step: "tax-free-threshold", rule: at("taxFreeThresholds"), inputs: { category: appliedCategory }, output: threshold.toFixed() });

  let remaining = max(taxable.minus(threshold), new Dec(0));
  let unroundedTax = new Dec(0);
  p.slabs.value.forEach((slab, i) => {
    const band = slab.width === null ? remaining : min(remaining, dec(slab.width));
    const tax = band.times(dec(slab.rate));
    trace.push({ step: `slab-${i + 1}`, rule: at("slabs"), inputs: { amountInBand: band.toFixed(), rate: slab.rate }, output: tax.toFixed() });
    unroundedTax = unroundedTax.plus(tax);
    remaining = remaining.minus(band);
  });
  const annualTax = roundWith(unroundedTax, p.annualTaxRounding.value);
  trace.push({ step: "projected-annual-tax", rule: at("annualTaxRounding"), inputs: { unrounded: unroundedTax.toFixed() }, output: annualTax.toFixed() });

  const opportunities = remainingRegularPeriodsAfterThis + 1;
  const ytdWithheld = dec(snapshot.yearToDate.taxWithheld);
  const outstanding = annualTax.minus(ytdWithheld);
  let withholding: Dec;
  if (outstanding.isNegative()) {
    // TAX-14: over-withholding never becomes a negative deduction or refund here.
    withholding = new Dec(0);
    warnings.push({
      code: "OVERWITHHOLDING_DETECTED",
      severity: "warning",
      message: `Year-to-date withholding exceeds projected annual tax by ${outstanding.negated().toFixed()}; route through the approved correction process.`,
      refs: ["TAX-14", "AC-13"],
      owner: "Payroll preparer",
    });
  } else {
    withholding = roundWith(outstanding.dividedBy(opportunities), p.periodWithholdingRounding.value);
  }
  trace.push({
    step: "period-withholding",
    rule: at("withholdingMethod"),
    inputs: { projectedAnnualTax: annualTax.toFixed(), yearToDateWithheld: ytdWithheld.toFixed(), payOpportunitiesIncludingThis: String(opportunities) },
    output: withholding.toFixed(),
  });

  if (withholding.greaterThan(grossPay)) {
    // Never produce negative net pay silently (PAY-09).
    blocking.push({ code: "WITHHOLDING_EXCEEDS_GROSS", severity: "blocking", message: "Period withholding exceeds gross pay.", refs: ["PAY-09", "PAY-21"], owner: "Payroll preparer" });
    return finish(snapshot, legalPack, policyPack, engineVersion, null, trace, warnings, blocking);
  }

  const netPay = grossPay.minus(withholding);
  trace.push({ step: "net-pay", rule: engineRule("gross-minus-deductions"), inputs: { gross: grossPay.toFixed(), salaryTds: withholding.toFixed() }, output: netPay.toFixed() });

  // PAY-11: balanced subledger draft.
  const zero = toDecimalString(new Dec(0), 2);
  const ledgerDraft: LedgerDraftLine[] = [
    { account: "salary-expense", debit: toDecimalString(grossPay, 2), credit: zero },
    { account: "net-pay-payable", debit: zero, credit: toDecimalString(netPay, 2) },
    { account: "salary-tax-payable", debit: zero, credit: toDecimalString(withholding, 2) },
  ];

  const amounts: CalculatedAmounts = {
    earnings: snapshot.earnings,
    grossPay: toDecimalString(grossPay, 2),
    appliedCategory,
    projectedAnnualTaxableIncome: toDecimalString(annualIncome, 2),
    salaryExemption: toDecimalString(exemption, 2),
    taxableIncome: toDecimalString(taxable, 2),
    projectedAnnualTax: toDecimalString(annualTax, 2),
    periodWithholding: toDecimalString(withholding, 2),
    deductions: [{ code: "salary-tds", amount: toDecimalString(withholding, 2) }],
    netPay: toDecimalString(netPay, 2),
    ledgerDraft,
  };
  return finish(snapshot, legalPack, policyPack, engineVersion, amounts, trace, warnings, blocking);
}

/**
 * EMP-06 / AC-06: choose the category whose threshold applies. Unverified
 * evidence and unreviewed overlaps are explicit blocks, never silent fallbacks
 * to `general` and never a sum of allowances.
 */
function resolveCategory(
  claims: readonly CategoryClaim[],
  pack: SalaryTaxRulePack,
  block: (code: string, message: string, refs: string[], owner?: string) => void,
): TaxCategory | null {
  const special = claims.filter((c) => c.category !== "general");
  let ok = true;
  for (const claim of special) {
    if (claim.evidenceStatus !== "verified") {
      block("CATEGORY_EVIDENCE_MISSING", `Category "${claim.category}" claimed with evidence status "${claim.evidenceStatus}".`, ["EMP-06", "PRN-03", "AC-06"], "HR administrator");
      ok = false;
    }
  }
  const thresholds = pack.parameters.taxFreeThresholds.value;
  const candidates: TaxCategory[] = special.length > 0 ? special.map((c) => c.category) : ["general"];
  for (const category of candidates) {
    if (thresholds[category] === undefined) {
      block("CATEGORY_THRESHOLD_MISSING", `${packRef(pack)} has no tax-free threshold for "${category}".`, ["LAW-05", "AC-15"], "Tax practitioner");
      ok = false;
    }
  }
  if (!ok) return null;
  if (candidates.length === 1) return candidates[0] ?? null;

  const precedence = pack.parameters.categoryPrecedence.value;
  if (precedence === null) {
    block("CATEGORY_PRECEDENCE_MISSING", `Employee qualifies for ${candidates.join(", ")} and ${packRef(pack)} has no reviewed precedence rule.`, ["EMP-06", "AC-06"], "Tax practitioner");
    return null;
  }
  const winner = precedence.find((c) => candidates.includes(c));
  if (!winner) {
    block("CATEGORY_PRECEDENCE_MISSING", "Precedence rule does not rank the claimed categories.", ["EMP-06", "AC-06"], "Tax practitioner");
    return null;
  }
  return winner;
}

function finish(
  snapshot: PayrollCalculationSnapshot,
  pack: SalaryTaxRulePack,
  policyPack: PolicyPack,
  engineVersion: string,
  amounts: CalculatedAmounts | null,
  ruleTrace: TraceStep[],
  warnings: Issue[],
  blockingErrors: Issue[],
): PayrollCalculationResult {
  const body = {
    status: blockingErrors.length > 0 ? ("blocked" as const) : ("calculated" as const),
    snapshotId: snapshot.snapshotId,
    engineVersion,
    legalPack: { ref: packRef(pack), contentHash: rulePackContentHash(pack), testOnly: pack.testOnly },
    policyPack: { ref: `${policyPack.policyId}@${policyPack.version}` },
    testOnly: pack.testOnly || snapshot.mode === "test",
    amounts: blockingErrors.length > 0 ? null : amounts,
    ruleTrace: blockingErrors.length > 0 ? [] : ruleTrace,
    warnings,
    blockingErrors,
  };
  return { ...body, traceHash: canonicalHash({ body, inputHash: canonicalHash(snapshot) }) };
}
