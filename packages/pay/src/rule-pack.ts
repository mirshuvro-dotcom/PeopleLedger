import type { DecimalString, IsoDate, Issue } from "@peopleledger/contracts";
import { canonicalHash } from "./canonical.js";
import type { RoundingRule } from "./money.js";

/**
 * Legal rule pack for Bangladesh salary income tax and employer withholding.
 *
 * Numbers live here as data (LAW-01); the engine only implements mechanisms
 * (exemption, slabs, average-rate withholding). Every parameter carries its own
 * evidence record (GOV-05) and the open legal items that still block it
 * (Appendix C). A pack with any unverified parameter can never be assigned to
 * production, whatever its status label says (GOV-06).
 */

/** LAW-04 workflow states. */
export const RULE_PACK_STATUSES = [
  "draft",
  "source-verified",
  "practitioner-reviewed",
  "tested",
  "independently-approved",
  "scheduled",
  "active",
  "superseded",
  "withdrawn",
] as const;
export type RulePackStatus = (typeof RULE_PACK_STATUSES)[number];

/** Evidence grades (Appendix B): A primary official text … D conflicting, U unverified. */
export type EvidenceGrade = "A" | "B" | "C" | "D" | "U";

export interface Evidence {
  readonly grade: EvidenceGrade;
  readonly sourceTitle?: string;
  readonly sourceUrl?: string;
  readonly issuingAuthority?: string;
  readonly publicationDate?: IsoDate;
  readonly sectionOrPage?: string;
  readonly extract?: string;
  readonly sourceHash?: string;
  readonly reviewer?: string;
  readonly note?: string;
}

export interface Param<T> {
  readonly value: T;
  readonly evidence: Evidence;
  /** Appendix C items (e.g. `L-26`) that must close before this value may be used in production. */
  readonly openItems: readonly string[];
}

/** Taxpayer categories that may carry a distinct tax-free threshold (EMP-06, Section 1.4). */
export const TAX_CATEGORIES = [
  "general",
  "woman",
  "age-65-or-over",
  "person-with-disability",
  "third-gender",
  "gazetted-war-wounded-freedom-fighter",
  "july-warrior",
] as const;
export type TaxCategory = (typeof TAX_CATEGORIES)[number];

export interface TaxSlab {
  /** Width of the band in BDT; `null` means "the remainder". Only the last slab may be open. */
  readonly width: DecimalString | null;
  /** Rate as a decimal fraction, e.g. `"0.10"`. */
  readonly rate: DecimalString;
}

export interface SalaryTaxParameters {
  readonly taxFreeThresholds: Param<Partial<Record<TaxCategory, DecimalString>>>;
  /**
   * Order in which overlapping categories are resolved (EMP-06). `null` means no
   * reviewed precedence exists, so an employee with more than one non-general
   * category is blocked rather than given a guessed or summed allowance.
   */
  readonly categoryPrecedence: Param<readonly TaxCategory[] | null>;
  readonly slabs: Param<readonly TaxSlab[]>;
  /** Exemption = min(income × numerator / denominator, cap). */
  readonly salaryExemption: Param<{
    readonly fractionNumerator: number;
    readonly fractionDenominator: number;
    readonly cap: DecimalString;
  }>;
  readonly withholdingMethod: Param<"average-rate-remaining-periods">;
  readonly annualTaxRounding: Param<RoundingRule>;
  readonly periodWithholdingRounding: Param<RoundingRule>;
}

export interface RuleApproval {
  readonly stage: Exclude<RulePackStatus, "draft" | "scheduled" | "active" | "superseded" | "withdrawn">;
  readonly actor: string;
  readonly role: "compliance-author" | "tax-practitioner" | "qa" | "independent-approver";
  readonly decidedAt: string;
  readonly rationale: string;
  /** Hash of the content that was reviewed; approvals do not carry over to edited content. */
  readonly contentHash: string;
}

export interface SalaryTaxRulePack {
  readonly schemaVersion: 1;
  readonly packId: string;
  readonly version: string;
  readonly jurisdiction: "BD";
  readonly legalRegime: string;
  readonly topic: "salary-income-tax-withholding";
  readonly title: string;
  /** Statutory income year this pack applies to (ORG-04). Never inferred from the clock. */
  readonly incomeYear: { readonly start: IsoDate; readonly end: IsoDate };
  readonly assessmentYearLabel: Param<string | null>;
  readonly effectiveFrom: IsoDate;
  readonly status: RulePackStatus;
  /** TEST ONLY packs are rejected by production validators regardless of status (Section 18.2). */
  readonly testOnly: boolean;
  /** Engine major versions able to interpret this pack (LAW-09, GOV-06). */
  readonly engineCompatibility: readonly string[];
  /** Scenarios this pack has been written for; anything else is blocked (Section 1.2). */
  readonly supportedScope: {
    readonly residency: readonly ("resident" | "non-resident")[];
    readonly payFrequency: readonly "monthly"[];
    readonly currency: readonly "BDT"[];
  };
  readonly author: string;
  readonly parameters: SalaryTaxParameters;
  readonly approvals: readonly RuleApproval[];
  readonly supersedes?: string;
}

/**
 * Hash of everything a reviewer approves. Excludes the mutable workflow fields
 * (`status`, `approvals`) so an approval binds the legal content, and editing
 * any parameter invalidates every earlier approval.
 */
export function rulePackContentHash(pack: SalaryTaxRulePack): string {
  const { status: _status, approvals: _approvals, ...content } = pack;
  return canonicalHash(content);
}

const PRODUCTION_STATUSES: readonly RulePackStatus[] = ["scheduled", "active"];

const REQUIRED_APPROVAL_STAGES: readonly RuleApproval["stage"][] = [
  "source-verified",
  "practitioner-reviewed",
  "tested",
  "independently-approved",
];

/**
 * GOV-05 / GOV-06 / LAW-04 gate: may this pack be assigned to a production
 * tenant? Returns every reason it may not; an empty list means assignable.
 *
 * Status is checked last on purpose: a status label is the weakest signal, so
 * flipping `status` to `active` on a draft still fails on evidence, open items
 * and approvals.
 */
export function productionAssignabilityIssues(pack: SalaryTaxRulePack): Issue[] {
  const issues: Issue[] = [];
  const block = (code: string, message: string, refs: string[], owner = "Compliance lead") =>
    issues.push({ code, severity: "blocking", message, refs, owner });

  if (pack.testOnly) {
    block("RULE_PACK_TEST_ONLY", `${packRef(pack)} is marked TEST ONLY and can never be production assigned.`, ["GOV-06", "Section 18.2"]);
  }

  for (const [name, param] of parameterEntries(pack)) {
    if (param.evidence.grade !== "A") {
      block(
        "RULE_PARAMETER_UNVERIFIED",
        `Parameter "${name}" has evidence grade ${param.evidence.grade}; authoritative (A) evidence is required.`,
        ["GOV-05", "LAW-02"],
        "Tax practitioner",
      );
    }
    if (param.openItems.length > 0) {
      block(
        "RULE_PARAMETER_OPEN_ITEM",
        `Parameter "${name}" is blocked by open legal item(s) ${param.openItems.join(", ")}.`,
        ["LAW-05", ...param.openItems],
        "Tax practitioner",
      );
    }
  }

  const contentHash = rulePackContentHash(pack);
  for (const stage of REQUIRED_APPROVAL_STAGES) {
    const approval = pack.approvals.find((a) => a.stage === stage && a.contentHash === contentHash);
    if (!approval) {
      block("RULE_PACK_APPROVAL_MISSING", `No "${stage}" approval bound to the current pack content.`, ["LAW-04"]);
    }
  }
  const independent = pack.approvals.find((a) => a.stage === "independently-approved" && a.contentHash === contentHash);
  if (independent && independent.actor === pack.author) {
    block("RULE_PACK_SELF_APPROVAL", "The pack author cannot independently approve their own pack.", ["LAW-04", "SEC-02"]);
  }

  if (!PRODUCTION_STATUSES.includes(pack.status)) {
    block("RULE_PACK_NOT_ACTIVE", `${packRef(pack)} is in status "${pack.status}".`, ["LAW-04"]);
  }
  return issues;
}

export function packRef(pack: Pick<SalaryTaxRulePack, "packId" | "version">): string {
  return `${pack.packId}@${pack.version}`;
}

function parameterEntries(pack: SalaryTaxRulePack): [string, Param<unknown>][] {
  return [
    ["assessmentYearLabel", pack.assessmentYearLabel],
    ...(Object.entries(pack.parameters) as [string, Param<unknown>][]),
  ];
}

/**
 * Structural validation of a pack loaded from data. Catches malformed packs
 * before they reach the engine; it says nothing about legal correctness.
 */
export function structuralIssues(pack: SalaryTaxRulePack): Issue[] {
  const issues: Issue[] = [];
  const bad = (message: string) =>
    issues.push({ code: "RULE_PACK_MALFORMED", severity: "blocking", message, refs: ["LAW-02", "GOV-06"] });

  if (pack.schemaVersion !== 1) bad(`Unsupported schemaVersion ${String(pack.schemaVersion)}.`);
  if (!RULE_PACK_STATUSES.includes(pack.status)) bad(`Unknown status "${String(pack.status)}".`);
  if (pack.incomeYear.start >= pack.incomeYear.end) bad("Income year start must precede its end.");

  const slabs = pack.parameters.slabs.value;
  if (slabs.length === 0) bad("At least one tax slab is required.");
  slabs.forEach((slab, i) => {
    const last = i === slabs.length - 1;
    if (slab.width === null && !last) bad(`Only the last slab may be open-ended (slab ${i}).`);
    if (slab.width !== null && last) bad("The last slab must be open-ended.");
    const rate = Number(slab.rate);
    if (!(rate >= 0 && rate <= 1)) bad(`Slab ${i} rate must be between 0 and 1.`);
  });

  const ex = pack.parameters.salaryExemption.value;
  if (!(Number.isInteger(ex.fractionNumerator) && Number.isInteger(ex.fractionDenominator) && ex.fractionDenominator > 0)) {
    bad("Salary exemption fraction must use positive integers.");
  }
  for (const r of [pack.parameters.annualTaxRounding.value, pack.parameters.periodWithholdingRounding.value]) {
    if (!Number.isInteger(r.scale) || r.scale < 0 || r.scale > 4) bad("Rounding scale must be an integer 0–4.");
  }
  return issues;
}
