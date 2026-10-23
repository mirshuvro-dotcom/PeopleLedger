"use client";

import { useState } from "react";
import { apiFetch, ApiFailure, bdt } from "@/lib/api";
import { Badge, Card, ErrorBox, Field, PageHeader } from "@/components/ui";

interface Issue {
  code: string;
  severity: string;
  message: string;
  refs: string[];
  owner?: string;
}
interface Preview {
  result: {
    status: string;
    testOnly: boolean;
    engineVersion: string;
    legalPack: { ref: string; contentHash: string };
    traceHash: string;
    amounts: null | {
      grossPay: string;
      projectedAnnualTaxableIncome: string;
      salaryExemption: string;
      taxableIncome: string;
      projectedAnnualTax: string;
      periodWithholding: string;
      netPay: string;
      ledgerDraft: { account: string; debit: string; credit: string }[];
    };
    ruleTrace: { step: string; rule: string; inputs: Record<string, string>; output: string }[];
    warnings: Issue[];
    blockingErrors: Issue[];
  };
  payslip: null | { text: { en: string; bn: string } };
}

const CATEGORIES = ["general", "woman", "age-65-or-over", "person-with-disability", "third-gender", "gazetted-war-wounded-freedom-fighter", "july-warrior"];

export default function PayrollPage() {
  const [form, setForm] = useState({ monthlyGross: "100000", month: 1, category: "general", categoryEvidence: "verified", residency: "resident", ytdTaxable: "0", ytdWithheld: "0" });
  const [data, setData] = useState<Preview | null>(null);
  const [error, setError] = useState<ApiFailure | null>(null);
  const [lang, setLang] = useState<"en" | "bn">("en");
  const a = data?.result.amounts;

  return (
    <>
      <PageHeader title="Payroll calculator" subtitle="The deterministic engine (Section 14.3) with the Appendix B TEST ONLY pack. Nothing is stored or payable." />
      <div className="notice" role="note">
        TEST ONLY: every tax figure in this pack is unverified (evidence grade U). Results are for checking the software, not tax advice.
      </div>
      <Card title="Inputs">
        <form
          className="inline"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            apiFetch<Preview>("/dev/payroll/preview", null, { method: "POST", body: form }).then(setData, (err: unknown) => setError(err instanceof ApiFailure ? err : null));
          }}
        >
          <Field label="Monthly gross (BDT)">
            <input required inputMode="decimal" pattern="\d{1,9}(\.\d{1,2})?" value={form.monthlyGross} onChange={(e) => setForm({ ...form, monthlyGross: e.target.value })} />
          </Field>
          <Field label="Month of income year" hint="1 = July">
            <input type="number" min={1} max={12} value={form.month} onChange={(e) => setForm({ ...form, month: Number(e.target.value) })} />
          </Field>
          <Field label="Taxpayer category">
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Category evidence">
            <select value={form.categoryEvidence} onChange={(e) => setForm({ ...form, categoryEvidence: e.target.value })}>
              <option>verified</option>
              <option>pending</option>
              <option>rejected</option>
              <option>expired</option>
            </select>
          </Field>
          <Field label="Residency">
            <select value={form.residency} onChange={(e) => setForm({ ...form, residency: e.target.value })}>
              <option>resident</option>
              <option>non-resident</option>
              <option>undetermined</option>
            </select>
          </Field>
          <Field label="YTD taxable">
            <input inputMode="decimal" value={form.ytdTaxable} onChange={(e) => setForm({ ...form, ytdTaxable: e.target.value })} />
          </Field>
          <Field label="YTD withheld">
            <input inputMode="decimal" value={form.ytdWithheld} onChange={(e) => setForm({ ...form, ytdWithheld: e.target.value })} />
          </Field>
          <button>Calculate</button>
        </form>
      </Card>
      <ErrorBox error={error} />

      {data ? (
        <>
          <Card title="Result">
            <p>
              <Badge>{data.result.status}</Badge> {data.result.testOnly ? <Badge tone="warn">TEST ONLY</Badge> : null} · pack <code>{data.result.legalPack.ref}</code> · engine {data.result.engineVersion} · trace hash{" "}
              <code>{data.result.traceHash.slice(0, 16)}…</code>
            </p>
            {data.result.blockingErrors.length > 0 ? (
              <div className="error" role="alert">
                <strong>Blocked — no amounts produced (PRN-03):</strong>
                <ul>
                  {data.result.blockingErrors.map((b, i) => (
                    <li key={i}>
                      <code>{b.code}</code> {b.message} <span className="muted">({b.refs.join(", ")}{b.owner ? ` · owner: ${b.owner}` : ""})</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {data.result.warnings.map((w, i) => (
              <div key={i} className="notice">
                <code>{w.code}</code> {w.message}
              </div>
            ))}
            {a ? (
              <div className="stats">
                {(
                  [
                    ["Gross pay", a.grossPay],
                    ["Projected annual taxable", a.projectedAnnualTaxableIncome],
                    ["Salary exemption", a.salaryExemption],
                    ["Taxable income", a.taxableIncome],
                    ["Projected annual tax", a.projectedAnnualTax],
                    ["Tax withheld this month", a.periodWithholding],
                    ["Net pay", a.netPay],
                  ] as const
                ).map(([label, value]) => (
                  <div className="stat" key={label}>
                    <div className="label">{label}</div>
                    <div className="value" style={{ fontSize: 18 }}>
                      {bdt(value)}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </Card>

          {a ? (
            <div className="grid">
              <Card title="Calculation trace">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Step</th>
                        <th>Rule</th>
                        <th className="num">Output</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.result.ruleTrace.map((t) => (
                        <tr key={t.step} title={JSON.stringify(t.inputs)}>
                          <td>{t.step}</td>
                          <td className="mono muted">{t.rule}</td>
                          <td className="num">{t.output}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
              <Card title="Ledger draft (balanced)">
                <table>
                  <thead>
                    <tr>
                      <th>Account</th>
                      <th className="num">Debit</th>
                      <th className="num">Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.ledgerDraft.map((l) => (
                      <tr key={l.account}>
                        <td>{l.account}</td>
                        <td className="num">{bdt(l.debit)}</td>
                        <td className="num">{bdt(l.credit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </div>
          ) : null}

          {data.payslip ? (
            <Card
              title="Draft payslip"
              actions={
                <div className="tabs" role="tablist">
                  <button role="tab" aria-selected={lang === "en"} className={lang === "en" ? "" : "secondary"} onClick={() => setLang("en")}>
                    English
                  </button>
                  <button role="tab" aria-selected={lang === "bn"} className={lang === "bn" ? "" : "secondary"} onClick={() => setLang("bn")}>
                    বাংলা
                  </button>
                </div>
              }
            >
              <pre className="payslip" lang={lang}>
                {data.payslip.text[lang]}
              </pre>
            </Card>
          ) : null}
        </>
      ) : null}
    </>
  );
}
