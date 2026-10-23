import { ContractError, decimalString, isoDate } from "@peopleledger/contracts";
import { RULE_PACK_STATUSES, TAX_CATEGORIES, type SalaryTaxRulePack } from "./rule-pack.js";

/**
 * Parse a rule pack from untrusted JSON (a file, an import, an API body).
 * Validates every date and decimal so branded types are earned, not asserted.
 * Legal approval is a separate question: see `productionAssignabilityIssues`.
 */
export function parseSalaryTaxRulePack(input: unknown): SalaryTaxRulePack {
  const p = obj(input, "pack");
  const params = obj(p.parameters, "parameters");
  const iy = obj(p.incomeYear, "incomeYear");
  isoDate(str(iy.start, "incomeYear.start"));
  isoDate(str(iy.end, "incomeYear.end"));
  isoDate(str(p.effectiveFrom, "effectiveFrom"));
  if (!RULE_PACK_STATUSES.includes(p.status as never)) fail(`Unknown status ${String(p.status)}`);
  if (typeof p.testOnly !== "boolean") fail("testOnly must be boolean");

  const expected = [
    "taxFreeThresholds",
    "categoryPrecedence",
    "slabs",
    "salaryExemption",
    "withholdingMethod",
    "annualTaxRounding",
    "periodWithholdingRounding",
  ];
  for (const key of expected) {
    const param = obj(params[key], `parameters.${key}`);
    const evidence = obj(param.evidence, `parameters.${key}.evidence`);
    if (!["A", "B", "C", "D", "U"].includes(evidence.grade as string)) fail(`Bad evidence grade on ${key}`);
    if (!Array.isArray(param.openItems)) fail(`parameters.${key}.openItems must be an array`);
  }
  const unknownKeys = Object.keys(params).filter((k) => !expected.includes(k));
  if (unknownKeys.length > 0) fail(`Unknown parameters: ${unknownKeys.join(", ")}`);

  const thresholds = obj(obj(params.taxFreeThresholds, "").value, "taxFreeThresholds.value");
  for (const [category, amount] of Object.entries(thresholds)) {
    if (!TAX_CATEGORIES.includes(category as never)) fail(`Unknown tax category ${category}`);
    decimalString(str(amount, `threshold ${category}`));
  }
  const slabs = obj(params.slabs, "").value;
  if (!Array.isArray(slabs)) fail("slabs.value must be an array");
  for (const slab of slabs as unknown[]) {
    const s = obj(slab, "slab");
    if (s.width !== null) decimalString(str(s.width, "slab.width"));
    decimalString(str(s.rate, "slab.rate"));
  }
  decimalString(str(obj(obj(params.salaryExemption, "").value, "salaryExemption.value").cap, "salaryExemption.cap"));

  return input as SalaryTaxRulePack;
}

function obj(v: unknown, path: string): Record<string, unknown> {
  if (v === null || typeof v !== "object" || Array.isArray(v)) fail(`${path} must be an object`);
  return v as Record<string, unknown>;
}

function str(v: unknown, path: string): string {
  if (typeof v !== "string") fail(`${path} must be a string`);
  return v as string;
}

function fail(message: string): never {
  throw new ContractError("RULE_PACK_PARSE_ERROR", message);
}
