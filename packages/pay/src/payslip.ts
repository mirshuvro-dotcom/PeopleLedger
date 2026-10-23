import type { DecimalString } from "@peopleledger/contracts";
import { dec, sum, toDecimalString } from "./money.js";
import type { PayrollCalculationResult, PayrollCalculationSnapshot } from "./engine.js";

/**
 * Draft payslip view model (PAY-14, PAY-22 subset). Built only from a
 * calculation result and identity labels; it never recalculates anything, so
 * the payslip cannot drift from the trace (Section 19 item 4).
 */
export interface DraftPayslip {
  readonly status: "draft";
  /** TEST ONLY payslips come from unapproved packs and must never be released or paid. */
  readonly testOnly: boolean;
  readonly reference: string;
  readonly revision: number;
  readonly entityName: string;
  readonly employeeName: { readonly en: string; readonly bn?: string };
  readonly employeeCode: string;
  readonly period: { readonly start: string; readonly end: string; readonly paymentDate: string };
  readonly earnings: readonly { readonly code: string; readonly label: { readonly en: string; readonly bn: string }; readonly amount: DecimalString }[];
  readonly grossPay: DecimalString;
  readonly taxWithheld: DecimalString;
  readonly netPay: DecimalString;
  readonly yearToDate: { readonly taxableSalary: DecimalString; readonly taxWithheld: DecimalString };
  readonly legalPackRef: string;
  readonly engineVersion: string;
  readonly traceHash: string;
}

export interface PayslipIdentity {
  readonly entityName: string;
  readonly employeeName: { readonly en: string; readonly bn?: string };
  readonly employeeCode: string;
  readonly revision: number;
}

export function buildDraftPayslip(
  snapshot: PayrollCalculationSnapshot,
  result: PayrollCalculationResult,
  identity: PayslipIdentity,
): DraftPayslip {
  if (result.status !== "calculated" || result.amounts === null) {
    throw new Error(`Cannot build a payslip for a blocked calculation (${result.blockingErrors.map((e) => e.code).join(", ")}).`);
  }
  if (result.snapshotId !== snapshot.snapshotId) {
    throw new Error("Calculation result does not belong to this snapshot.");
  }
  const a = result.amounts;
  return {
    status: "draft",
    testOnly: result.testOnly,
    reference: `${snapshot.snapshotId}/r${identity.revision}`,
    revision: identity.revision,
    entityName: identity.entityName,
    employeeName: identity.employeeName,
    employeeCode: identity.employeeCode,
    period: { start: snapshot.period.start, end: snapshot.period.end, paymentDate: snapshot.period.paymentDate },
    earnings: a.earnings.map((e) => ({ code: e.componentCode, label: e.label, amount: toDecimalString(dec(e.amount), 2) })),
    grossPay: a.grossPay,
    taxWithheld: a.periodWithholding,
    netPay: a.netPay,
    yearToDate: {
      taxableSalary: toDecimalString(sum([dec(snapshot.yearToDate.taxableSalary), dec(a.grossPay)]), 2),
      taxWithheld: toDecimalString(sum([dec(snapshot.yearToDate.taxWithheld), dec(a.periodWithholding)]), 2),
    },
    legalPackRef: result.legalPack.ref,
    engineVersion: result.engineVersion,
    traceHash: result.traceHash,
  };
}

/**
 * Format BDT with South Asian (lakh/crore) grouping, e.g. 1,20,000.00 (RPT-19).
 * Pure string work on the decimal string; no float conversion.
 */
export function formatBdtLakh(value: DecimalString): string {
  const negative = value.startsWith("-");
  const [intPartRaw = "0", frac = ""] = (negative ? value.slice(1) : value).split(".");
  const last3 = intPartRaw.slice(-3);
  const rest = intPartRaw.slice(0, -3);
  const grouped = rest.length > 0 ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}` : last3;
  return `${negative ? "-" : ""}${grouped}${frac ? `.${frac}` : ""}`;
}

const LABELS = {
  title: { en: "Payslip", bn: "বেতন বিবরণী" },
  draft: { en: "DRAFT — not released", bn: "খসড়া — প্রকাশিত নয়" },
  testOnly: { en: "TEST ONLY — unapproved legal pack, not valid for payment", bn: "শুধুমাত্র পরীক্ষামূলক — অননুমোদিত আইনি প্যাক, অর্থপ্রদানের জন্য বৈধ নয়" },
  period: { en: "Period", bn: "সময়কাল" },
  paymentDate: { en: "Payment date", bn: "প্রদানের তারিখ" },
  earnings: { en: "Earnings", bn: "আয়" },
  gross: { en: "Gross pay", bn: "মোট বেতন" },
  tds: { en: "Tax deducted at source", bn: "উৎসে কর কর্তন" },
  net: { en: "Net pay", bn: "নিট প্রদেয়" },
  ytd: { en: "Year to date", bn: "আয়বর্ষের শুরু থেকে" },
  ytdTaxable: { en: "Taxable salary", bn: "করযোগ্য বেতন" },
} as const;

/** Plain-text rendering used by the vertical-slice demo. PDF rendering is a later feature. */
export function renderPayslipText(slip: DraftPayslip, lang: "en" | "bn"): string {
  const L = (k: keyof typeof LABELS) => LABELS[k][lang];
  const money = (v: DecimalString) => `BDT ${formatBdtLakh(v)}`;
  const row = (label: string, value: string) => `  ${label.padEnd(34)} ${value.padStart(18)}`;
  const lines = [
    `*** ${L("draft")} ***`,
    ...(slip.testOnly ? [`*** ${L("testOnly")} ***`] : []),
    `${slip.entityName} — ${L("title")}`,
    `${lang === "bn" && slip.employeeName.bn ? slip.employeeName.bn : slip.employeeName.en} (${slip.employeeCode})`,
    `${L("period")}: ${slip.period.start} – ${slip.period.end}   ${L("paymentDate")}: ${slip.period.paymentDate}`,
    `${L("earnings")}:`,
    ...slip.earnings.map((e) => row(e.label[lang], money(e.amount))),
    row(L("gross"), money(slip.grossPay)),
    row(L("tds"), money(slip.taxWithheld)),
    row(L("net"), money(slip.netPay)),
    `${L("ytd")}:`,
    row(L("ytdTaxable"), money(slip.yearToDate.taxableSalary)),
    row(L("tds"), money(slip.yearToDate.taxWithheld)),
    `ref ${slip.reference} | pack ${slip.legalPackRef} | engine ${slip.engineVersion} | trace ${slip.traceHash.slice(0, 16)}`,
  ];
  return lines.join("\n");
}
