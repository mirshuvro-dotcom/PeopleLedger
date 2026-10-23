import { existsSync, readFileSync } from "node:fs";
import type { FastifyInstance } from "fastify";
import { decimalString, isoDate, type EmploymentId, type LegalEntityId, type PayGroupId, type TenantId } from "@peopleledger/contracts";
import {
  buildDraftPayslip,
  calculatePayroll,
  parseSalaryTaxRulePack,
  renderPayslipText,
  TAX_CATEGORIES,
  type PayrollCalculationSnapshot,
  type SalaryTaxRulePack,
  type TaxCategory,
} from "@peopleledger/pay";
import { ApiError } from "../errors.js";
import { body } from "./schemas.js";

/**
 * Developer-console endpoints. Registered only when developer identity is
 * enabled (never in production). They read generated artifacts and the TEST
 * ONLY rule pack; none of them touch tenant data.
 */
export function devRoutes(app: FastifyInstance, repoRoot: URL): void {
  app.get("/dev/identities", async () => {
    const file = new URL(".dev-seed.json", repoRoot);
    if (!existsSync(file)) throw new ApiError(404, "NOT_SEEDED", "No developer data yet. Run `pnpm dev:setup`.");
    return JSON.parse(readFileSync(file, "utf8"));
  });

  app.get("/dev/progress", async () => {
    const file = new URL("docs/traceability/matrix.json", repoRoot);
    if (!existsSync(file)) throw new ApiError(404, "NOT_GENERATED", "Run `pnpm traceability`.");
    return JSON.parse(readFileSync(file, "utf8"));
  });

  let pack: SalaryTaxRulePack | undefined;
  const loadPack = () =>
    (pack ??= parseSalaryTaxRulePack(
      JSON.parse(readFileSync(new URL("tests/fixtures/rule-packs/BD-INCOME-TAX-SALARY.FA2026-draft-1.TEST-ONLY.json", repoRoot), "utf8")),
    ));

  // Pure engine run with the Appendix B TEST ONLY pack: always test mode, never stored, never payable.
  app.post(
    "/dev/payroll/preview",
    {
      schema: {
        body: body(["monthlyGross"], {
          monthlyGross: { type: "string", pattern: "^\\d{1,9}(\\.\\d{1,2})?$" },
          month: { type: "integer", minimum: 1, maximum: 12, default: 1 },
          category: { type: "string", enum: [...TAX_CATEGORIES], default: "general" },
          categoryEvidence: { type: "string", enum: ["verified", "pending", "rejected", "expired"], default: "verified" },
          residency: { type: "string", enum: ["resident", "non-resident", "undetermined"], default: "resident" },
          ytdTaxable: { type: "string", pattern: "^\\d{1,10}(\\.\\d{1,2})?$", default: "0" },
          ytdWithheld: { type: "string", pattern: "^\\d{1,10}(\\.\\d{1,2})?$", default: "0" },
        }),
      },
    },
    async (req) => {
      const b = req.body as { monthlyGross: string; month: number; category: TaxCategory; categoryEvidence: "verified"; residency: "resident"; ytdTaxable: string; ytdWithheld: string };
      const start = new Date(Date.UTC(2026, 6 + b.month - 1, 1));
      const end = new Date(Date.UTC(2026, 6 + b.month, 0));
      const day = (d: Date) => isoDate(d.toISOString().slice(0, 10));
      const snapshot: PayrollCalculationSnapshot = {
        snapshotId: `dev-preview-${b.month}`,
        mode: "test",
        tenantId: "dev-preview" as TenantId,
        legalEntityId: "dev-preview" as LegalEntityId,
        payGroupId: "dev-preview" as PayGroupId,
        employmentId: "dev-preview" as EmploymentId,
        period: { start: day(start), end: day(end), paymentDate: day(end), incomeYearStart: isoDate("2026-07-01"), incomeYearEnd: isoDate("2027-06-30") },
        employee: {
          residency: b.residency,
          payFrequency: "monthly",
          currency: "BDT",
          categoryClaims: [{ category: b.category, evidenceStatus: b.category === "general" ? "not-required" : b.categoryEvidence }],
        },
        earnings: [{ componentCode: "BASIC", label: { en: "Basic salary", bn: "মূল বেতন" }, amount: decimalString(b.monthlyGross), taxTreatment: "salary-taxable" }],
        projection: {
          remainingRegularPeriodsAfterThis: 12 - b.month,
          projectedTaxablePerRemainingPeriod: decimalString(b.monthlyGross),
          expectedAdditionalTaxable: decimalString("0"),
          assumptions: ["Current monthly pay continues for the rest of the income year (synthetic)."],
        },
        yearToDate: { taxableSalary: decimalString(b.ytdTaxable), taxWithheld: decimalString(b.ytdWithheld) },
      };
      const result = calculatePayroll(snapshot, loadPack(), { policyId: "POL-DEV", version: "1", tenantId: snapshot.tenantId });
      if (result.status !== "calculated") return { result, payslip: null };
      const slip = buildDraftPayslip(snapshot, result, { entityName: "Synthetic Preview Ltd", employeeName: { en: "Synthetic Employee", bn: "পরীক্ষা কর্মী" }, employeeCode: "E-PREVIEW", revision: 1 });
      return { result, payslip: { model: slip, text: { en: renderPayslipText(slip, "en"), bn: renderPayslipText(slip, "bn") } } };
    },
  );
}
