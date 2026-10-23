import { describe, expect, it } from "vitest";
import {
  buildDraftPayslip,
  calculatePayroll,
  formatBdtLakh,
  parseSalaryTaxRulePack,
  productionAssignabilityIssues,
  renderPayslipText,
} from "../src/index.js";
import { decimalString } from "@peopleledger/contracts";
import { loadTestPack, POLICY, snapshot, syntheticApprovedPack, withApprovals } from "./helpers.js";

const codes = (issues: { code: string }[]) => [...new Set(issues.map((i) => i.code))].sort();

describe("rule pack governance (LAW-04, GOV-05, GOV-06)", () => {
  it("never makes the Appendix B pack production assignable", () => {
    expect(codes(productionAssignabilityIssues(loadTestPack()))).toEqual([
      "RULE_PACK_APPROVAL_MISSING",
      "RULE_PACK_NOT_ACTIVE",
      "RULE_PACK_TEST_ONLY",
      "RULE_PARAMETER_OPEN_ITEM",
      "RULE_PARAMETER_UNVERIFIED",
    ]);
  });

  it("is not fooled by flipping status and testOnly labels", () => {
    const tampered = { ...loadTestPack(), status: "active" as const, testOnly: false };
    expect(codes(productionAssignabilityIssues(tampered))).toEqual([
      "RULE_PACK_APPROVAL_MISSING",
      "RULE_PARAMETER_OPEN_ITEM",
      "RULE_PARAMETER_UNVERIFIED",
    ]);
  });

  it("accepts a pack with authoritative evidence and independent approvals", () => {
    expect(productionAssignabilityIssues(syntheticApprovedPack())).toEqual([]);
  });

  it("invalidates approvals when legal content changes after review", () => {
    const approved = syntheticApprovedPack();
    const edited = {
      ...approved,
      parameters: {
        ...approved.parameters,
        salaryExemption: { ...approved.parameters.salaryExemption, value: { ...approved.parameters.salaryExemption.value, cap: decimalString("600000") } },
      },
    };
    expect(codes(productionAssignabilityIssues(edited))).toEqual(["RULE_PACK_APPROVAL_MISSING"]);
  });

  it("blocks an author approving their own pack", () => {
    const self = withApprovals({ ...syntheticApprovedPack("same@example.test"), approvals: [] }, "same@example.test");
    expect(codes(productionAssignabilityIssues(self))).toEqual(["RULE_PACK_SELF_APPROVAL"]);
  });
});

describe("pack parsing", () => {
  it("rejects malformed numbers and unknown parameters", () => {
    const raw = JSON.parse(JSON.stringify(loadTestPack()));
    raw.parameters.slabs.value[0].rate = 0.1;
    expect(() => parseSalaryTaxRulePack(raw)).toThrow(/slab.rate/);

    const extra = JSON.parse(JSON.stringify(loadTestPack()));
    extra.parameters.surprise = { value: 1, evidence: { grade: "U" }, openItems: [] };
    expect(() => parseSalaryTaxRulePack(extra)).toThrow(/Unknown parameters/);
  });
});

describe("draft payslip (PAY-14, PAY-22 subset)", () => {
  it("formats amounts with lakh/crore grouping (RPT-19)", () => {
    expect(formatBdtLakh(decimalString("0.50"))).toBe("0.50");
    expect(formatBdtLakh(decimalString("999.00"))).toBe("999.00");
    expect(formatBdtLakh(decimalString("120000.00"))).toBe("1,20,000.00");
    expect(formatBdtLakh(decimalString("12345678.9"))).toBe("1,23,45,678.9");
    expect(formatBdtLakh(decimalString("-3100000"))).toBe("-31,00,000");
  });

  it("is built only from the calculation and carries the TEST ONLY mark in both languages", () => {
    const s = snapshot({ monthlyGross: "100000" });
    const r = calculatePayroll(s, loadTestPack(), POLICY);
    const slip = buildDraftPayslip(s, r, { entityName: "Synthetic Co", employeeName: { en: "Test Employee", bn: "পরীক্ষা কর্মী" }, employeeCode: "E-001", revision: 1 });
    expect(slip).toMatchObject({ testOnly: true, grossPay: "100000.00", taxWithheld: "3750.00", netPay: "96250.00", traceHash: r.traceHash });
    expect(renderPayslipText(slip, "en")).toContain("TEST ONLY");
    expect(renderPayslipText(slip, "bn")).toContain("শুধুমাত্র পরীক্ষামূলক");
    expect(renderPayslipText(slip, "en")).toContain("BDT 96,250.00");
  });

  it("refuses to build a payslip from a blocked calculation", () => {
    const s = snapshot({ monthlyGross: "100000", mode: "production" });
    const r = calculatePayroll(s, loadTestPack(), POLICY);
    expect(() => buildDraftPayslip(s, r, { entityName: "x", employeeName: { en: "x" }, employeeCode: "x", revision: 1 })).toThrow(/blocked/);
  });
});
