"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { useApi } from "@/lib/api";
import { Badge, Card, ErrorBox, Field, Loading, PageHeader } from "@/components/ui";
import type { Matrix } from "../progress-types";

function RequirementsView() {
  const params = useSearchParams();
  const { data, error, loading } = useApi<Matrix>("/dev/progress");
  const [status, setStatus] = useState("");
  const [release, setRelease] = useState("");
  const [family, setFamily] = useState(params.get("family") ?? "");
  const [q, setQ] = useState("");
  const families = useMemo(() => [...new Set((data?.rows ?? []).map((r) => r.family))].sort(), [data]);
  const rows = (data?.rows ?? []).filter(
    (r) =>
      (!status || r.status === status) &&
      (!release || r.release.startsWith(release)) &&
      (!family || r.family === family) &&
      (!q || `${r.id} ${r.evidence} ${r.accountableRole}`.toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <>
      <PageHeader title="Requirements" subtitle="Appendix F traceability matrix. Status and evidence come from docs/traceability/status.json." />
      <Card>
        <form className="inline" onSubmit={(e) => e.preventDefault()}>
          <Field label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              <option>Passed</option>
              <option>In progress</option>
              <option>Planned</option>
            </select>
          </Field>
          <Field label="Release">
            <select value={release} onChange={(e) => setRelease(e.target.value)}>
              <option value="">All</option>
              <option>R0</option>
              <option>R1</option>
              <option>R2</option>
            </select>
          </Field>
          <Field label="Family">
            <select value={family} onChange={(e) => setFamily(e.target.value)}>
              <option value="">All</option>
              {families.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </Field>
          <Field label="Search">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ID, evidence, role" />
          </Field>
          <span className="muted">{rows.length} shown</span>
        </form>
      </Card>
      <ErrorBox error={error} />
      <Loading show={loading} />
      <Card>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Release</th>
                <th>Status</th>
                <th>Evidence</th>
                <th>Tests</th>
                <th>Accountable</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.id}</td>
                  <td>{r.release}</td>
                  <td>
                    <Badge>{r.status}</Badge>
                  </td>
                  <td>{r.evidence || <span className="muted">—</span>}</td>
                  <td className="mono">{r.tests.map((t) => t.split("/").pop()).join(", ") || "—"}</td>
                  <td className="muted">{r.accountableRole}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

export default function RequirementsPage() {
  return (
    <Suspense fallback={<p className="muted">Loading…</p>}>
      <RequirementsView />
    </Suspense>
  );
}
