"use client";

import Link from "next/link";
import { useApi } from "@/lib/api";
import { Badge, Card, ErrorBox, Loading, PageHeader } from "@/components/ui";
import type { Matrix } from "./progress-types";

interface Health {
  status: string;
  database: string;
  environment: string;
  devAuth: boolean;
}
interface Me {
  email: string;
  status: string;
  asOf: string;
  permissions: { code: string; tenant_wide: boolean; entities: string[] }[];
}

export default function Overview() {
  const health = useApi<Health>("/health");
  const progress = useApi<Matrix>("/dev/progress");
  const me = useApi<Me>("/v1/me");

  const families = new Map<string, { total: number; passed: number; progress: number }>();
  for (const r of progress.data?.rows ?? []) {
    const f = families.get(r.family) ?? { total: 0, passed: 0, progress: 0 };
    f.total += 1;
    if (r.status === "Passed") f.passed += 1;
    if (r.status === "In progress") f.progress += 1;
    families.set(r.family, f);
  }
  const started = [...families.entries()].filter(([, f]) => f.passed + f.progress > 0);
  const t = progress.data?.totals;

  return (
    <>
      <PageHeader title="Overview" subtitle="Build status of PeopleLedger against the v3.1 requirements baseline." />

      <div className="stats">
        <div className="stat">
          <div className="label">API</div>
          <div className="value">{health.data ? <Badge tone="ok">online</Badge> : health.error ? <Badge tone="bad">offline</Badge> : "…"}</div>
        </div>
        <div className="stat">
          <div className="label">Database</div>
          <div className="value">{health.data ? <Badge tone={health.data.database === "ok" ? "ok" : "bad"}>{health.data.database}</Badge> : "…"}</div>
        </div>
        <div className="stat">
          <div className="label">Requirements</div>
          <div className="value">{t?.requirements ?? "…"}</div>
        </div>
        <div className="stat">
          <div className="label">Passed (test evidence)</div>
          <div className="value">{t?.byStatus.Passed ?? 0}</div>
        </div>
        <div className="stat">
          <div className="label">In progress</div>
          <div className="value">{t?.byStatus["In progress"] ?? 0}</div>
        </div>
        <div className="stat">
          <div className="label">Planned</div>
          <div className="value">{t?.byStatus.Planned ?? 0}</div>
        </div>
      </div>
      <ErrorBox error={health.error ?? progress.error} />

      <div className="grid">
        <Card title="Started requirement families">
          <Loading show={progress.loading} />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Family</th>
                  <th className="num">Passed</th>
                  <th className="num">In progress</th>
                  <th className="num">Total</th>
                  <th style={{ width: "35%" }}>Progress</th>
                </tr>
              </thead>
              <tbody>
                {started.map(([name, f]) => (
                  <tr key={name}>
                    <td>
                      <Link href={`/requirements?family=${name}`}>{name}</Link>
                    </td>
                    <td className="num">{f.passed}</td>
                    <td className="num">{f.progress}</td>
                    <td className="num">{f.total}</td>
                    <td>
                      <div className="bar" aria-label={`${f.passed} passed, ${f.progress} in progress of ${f.total}`}>
                        <span className="ok" style={{ width: `${(100 * f.passed) / f.total}%` }} />
                        <span className="warn" style={{ width: `${(100 * f.progress) / f.total}%` }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted">
            Release split: R0 {t?.byRelease.R0 ?? "…"} · R1 {t?.byRelease.R1 ?? "…"} · R2 {t?.byRelease.R2 ?? "…"}. A requirement is Passed only when tests that name it cover its full text.
          </p>
        </Card>

        <Card title="Your effective permissions">
          <ErrorBox error={me.error} />
          <Loading show={me.loading} />
          {me.data ? (
            <>
              <p className="muted">
                {me.data.email} · membership {me.data.status} · business date {me.data.asOf} (Asia/Dhaka)
              </p>
              {me.data.permissions.length === 0 ? (
                <p className="empty">No permissions: every data page will be refused (deny by default).</p>
              ) : (
                <ul>
                  {me.data.permissions.map((p) => (
                    <li key={p.code}>
                      <code>{p.code}</code> {p.tenant_wide ? <Badge tone="ok">tenant-wide</Badge> : <Badge tone="warn">{`${p.entities.length} entity`}</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : null}
        </Card>
      </div>

      <Card title="What you can check here">
        <ul>
          <li>Switch the <strong>Acting as</strong> user to see deny-by-default authorization and tenant isolation in action.</li>
          <li><Link href="/people">People</Link>: effective-dated history; every change is audited.</li>
          <li><Link href="/access">Access &amp; roles</Link>: memberships, roles, scoped assignments and a “why can this user…” check.</li>
          <li><Link href="/audit">Audit log</Link>: the tamper-evident chain, including refused requests, with one-click verification.</li>
          <li><Link href="/payroll">Payroll calculator</Link>: the deterministic engine with the TEST ONLY rule pack and a bilingual payslip.</li>
        </ul>
      </Card>
    </>
  );
}
