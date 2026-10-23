import { describe, expect, it } from "vitest";
import { decimalString } from "@peopleledger/contracts";
import { calculatePayroll, Dec, ENGINE_VERSION, type PayrollCalculationResult } from "../src/index.js";
import { loadTestPack, POLICY, snapshot, syntheticApprovedPack, type SnapshotOptions } from "./helpers.js";

const pack = loadTestPack();
const run = (o: SnapshotOptions, p = pack) => calculatePayroll(snapshot(o), p, POLICY, ENGINE_VERSION);
const codes = (r: PayrollCalculationResult) => r.blockingErrors.map((e) => e.code);

describe("Appendix B.4 draft test candidates (TEST ONLY, not golden cases)", () => {
  // Each assumes July (period 1 of 12), resident, all pay taxable salary, nothing else.
  it.each([
    { id: "T-01", gross: "50000", category: "general", exemption: "200000.00", taxable: "400000.00", annual: "0.00", monthly: "0.00" },
    { id: "T-02", gross: "100000", category: "general", exemption: "400000.00", taxable: "800000.00", annual: "45000.00", monthly: "3750.00" },
    { id: "T-03", gross: "100000", category: "woman", exemption: "400000.00", taxable: "800000.00", annual: "37500.00", monthly: "3125.00" },
    { id: "T-04", gross: "100000", category: "person-with-disability", exemption: "400000.00", taxable: "800000.00", annual: "27500.00", monthly: "2291.67" },
    { id: "T-05", gross: "300000", category: "general", exemption: "500000.00", taxable: "3100000.00", annual: "565000.00", monthly: "47083.33" },
  ] as const)("$id", ({ gross, category, exemption, taxable, annual, monthly }) => {
    const claims = [{ category, evidenceStatus: category === "general" ? "not-required" : "verified" } as const];
    const r = run({ monthlyGross: gross, claims });
    expect(codes(r)).toEqual([]);
    expect(r.status).toBe("calculated");
    expect(r.testOnly).toBe(true);
    expect(r.amounts).toMatchObject({
      appliedCategory: category,
      salaryExemption: exemption,
      taxableIncome: taxable,
      projectedAnnualTax: annual,
      periodWithholding: monthly,
    });
  });

  it("explains T-05 slab by slab in the trace", () => {
    const r = run({ monthlyGross: "300000" });
    const slabs = r.ruleTrace.filter((s) => s.step.startsWith("slab-")).map((s) => s.output);
    expect(slabs).toEqual(["30000", "60000", "100000", "375000", "0"]);
    expect(r.ruleTrace.every((s) => s.rule.length > 0)).toBe(true);
  });
});

describe("determinism and reproduction (Section 14.3, LAW-09, AC-09)", () => {
  it("produces identical output and trace hash for identical inputs", () => {
    const a = run({ monthlyGross: "123456.78" });
    const b = run({ monthlyGross: "123456.78" });
    expect(b).toEqual(a);
    expect(a.traceHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes the trace hash when any input changes", () => {
    expect(run({ monthlyGross: "100000" }).traceHash).not.toBe(run({ monthlyGross: "100000.01" }).traceHash);
  });

  it("refuses to impersonate a different engine version", () => {
    const r = calculatePayroll(snapshot({ monthlyGross: "100000" }), pack, POLICY, "2.0.0");
    expect(codes(r)).toContain("ENGINE_VERSION_UNAVAILABLE");
  });
});

describe("financial invariants", () => {
  it("posts a balanced ledger draft (PAY-11)", () => {
    const r = run({ monthlyGross: "300000" });
    const lines = r.amounts!.ledgerDraft;
    const debit = lines.reduce((s, l) => s.plus(l.debit), new Dec(0));
    const credit = lines.reduce((s, l) => s.plus(l.credit), new Dec(0));
    expect(debit.equals(credit)).toBe(true);
    expect(r.amounts!.netPay).toBe("252916.67");
  });

  it("trues up across the year so total withholding equals annual tax (T-04 over 12 months)", () => {
    let ytdTaxable = new Dec(0);
    let ytdWithheld = new Dec(0);
    for (let month = 1; month <= 12; month++) {
      const r = run({
        monthlyGross: "100000",
        periodIndex: month,
        ytdTaxable: ytdTaxable.toFixed(),
        ytdWithheld: ytdWithheld.toFixed(),
        claims: [{ category: "person-with-disability", evidenceStatus: "verified" }],
      });
      expect(r.status).toBe("calculated");
      ytdTaxable = ytdTaxable.plus(r.amounts!.grossPay);
      ytdWithheld = ytdWithheld.plus(r.amounts!.periodWithholding);
    }
    expect(ytdWithheld.toFixed(2)).toBe("27500.00");
  });

  it("re-projects after a mid-year raise and still withholds exactly the annual tax (AC-04 shape)", () => {
    let ytdTaxable = new Dec(0);
    let ytdWithheld = new Dec(0);
    for (let month = 1; month <= 12; month++) {
      const gross = month <= 6 ? "50000" : "100000";
      const r = run({ monthlyGross: gross, periodIndex: month, ytdTaxable: ytdTaxable.toFixed(), ytdWithheld: ytdWithheld.toFixed() });
      ytdTaxable = ytdTaxable.plus(r.amounts!.grossPay);
      ytdWithheld = ytdWithheld.plus(r.amounts!.periodWithholding);
    }
    // Annual 900,000; exemption 300,000; taxable 600,000; 200,000 above 400,000 at 10% = 20,000.
    expect(ytdTaxable.toFixed(2)).toBe("900000.00");
    expect(ytdWithheld.toFixed(2)).toBe("20000.00");
  });

  it("never produces a negative deduction or refund on over-withholding (TAX-14, AC-13)", () => {
    const r = run({ monthlyGross: "50000", periodIndex: 12, ytdTaxable: "550000", ytdWithheld: "9000" });
    expect(r.status).toBe("calculated");
    expect(r.amounts!.periodWithholding).toBe("0.00");
    expect(r.warnings.map((w) => w.code)).toEqual(["OVERWITHHOLDING_DETECTED"]);
  });

  it("handles boundary at the tax-free threshold exactly", () => {
    // Taxable exactly 400,000 (T-01) yields zero; one taka above yields 0.10 of tax over the year.
    const r = run({ monthlyGross: "50000", projectedPerRemaining: "50000", periodIndex: 12, ytdTaxable: "550001.50" });
    expect(r.amounts!.taxableIncome).toBe("400001.00");
    expect(r.amounts!.projectedAnnualTax).toBe("0.10");
  });
});

describe("explicit blocks instead of silent defaults (PRN-03, LAW-05)", () => {
  it("blocks a TEST ONLY pack in production mode (GOV-06)", () => {
    const r = run({ monthlyGross: "100000", mode: "production" });
    expect(r.status).toBe("blocked");
    expect(r.amounts).toBeNull();
    expect(codes(r)).toEqual(expect.arrayContaining(["RULE_PACK_TEST_ONLY", "RULE_PARAMETER_UNVERIFIED", "RULE_PARAMETER_OPEN_ITEM", "RULE_PACK_APPROVAL_MISSING", "RULE_PACK_NOT_ACTIVE"]));
  });

  it("allows production mode only for a fully approved pack", () => {
    const r = run({ monthlyGross: "100000", mode: "production" }, syntheticApprovedPack());
    expect(codes(r)).toEqual([]);
    expect(r.testOnly).toBe(false);
  });

  it("blocks overlapping categories without a reviewed precedence rule (EMP-06, AC-06)", () => {
    const r = run({
      monthlyGross: "100000",
      claims: [
        { category: "woman", evidenceStatus: "verified" },
        { category: "person-with-disability", evidenceStatus: "verified" },
      ],
    });
    expect(codes(r)).toEqual(["CATEGORY_PRECEDENCE_MISSING"]);
  });

  it("applies a reviewed precedence rule when one exists", () => {
    const withPrecedence = {
      ...pack,
      parameters: { ...pack.parameters, categoryPrecedence: { ...pack.parameters.categoryPrecedence, value: ["person-with-disability", "woman"] as const } },
    };
    const r = run(
      { monthlyGross: "100000", claims: [{ category: "woman", evidenceStatus: "verified" }, { category: "person-with-disability", evidenceStatus: "verified" }] },
      withPrecedence,
    );
    expect(r.amounts!.appliedCategory).toBe("person-with-disability");
    expect(r.amounts!.projectedAnnualTax).toBe("27500.00");
  });

  it.each(["pending", "rejected", "expired"] as const)("blocks a category claim with %s evidence", (evidenceStatus) => {
    const r = run({ monthlyGross: "100000", claims: [{ category: "woman", evidenceStatus }] });
    expect(codes(r)).toEqual(["CATEGORY_EVIDENCE_MISSING"]);
  });

  it.each([
    ["non-resident", "UNSUPPORTED_RESIDENCY"],
    ["undetermined", "RESIDENCY_UNDETERMINED"],
  ] as const)("blocks %s employees (TAX-11)", (residency, code) => {
    expect(codes(run({ monthlyGross: "100000", residency }))).toEqual([code]);
  });

  it("blocks a component without a reviewed tax treatment (TAX-05, AC-15)", () => {
    const s = snapshot({ monthlyGross: "100000" });
    const withCar = {
      ...s,
      earnings: [...s.earnings, { componentCode: "CAR", label: { en: "Car benefit", bn: "গাড়ি সুবিধা" }, amount: decimalString("10000"), taxTreatment: "unsupported" as const }],
    };
    expect(codes(calculatePayroll(withCar, pack, POLICY))).toEqual(["UNSUPPORTED_TAX_TREATMENT"]);
  });

  it("blocks a pack for a different income year (ORG-04, AC-17)", () => {
    const nextYear = { ...pack, incomeYear: { start: "2027-07-01", end: "2028-06-30" } } as typeof pack;
    expect(codes(run({ monthlyGross: "100000" }, nextYear))).toEqual(["RULE_PACK_INCOME_YEAR_MISMATCH"]);
  });

  it("blocks a policy pack from another tenant (PRN-07)", () => {
    const foreign = { ...POLICY, tenantId: "tnt_other" as typeof POLICY.tenantId };
    expect(codes(calculatePayroll(snapshot({ monthlyGross: "1" }), pack, foreign))).toEqual(["POLICY_PACK_TENANT_MISMATCH"]);
  });
});
