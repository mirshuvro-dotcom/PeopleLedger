"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { todayInDhaka, useAction, useApi } from "@/lib/api";
import { ActionStatus } from "@/components/ActionStatus";
import { Card, dateTime, ErrorBox, Field, Loading, PageHeader } from "@/components/ui";

interface Version {
  id: string;
  effective_from: string;
  effective_to: string | null;
  legal_name_en: string;
  legal_name_bn: string | null;
  preferred_name: string | null;
  birth_date: string | null;
  recorded_at: string;
  recorded_by: string;
}
interface Employment {
  id: string;
  legal_entity_name: string;
  employee_code: string;
  hire_date: string;
  end_date: string | null;
  versions: { id: string; effectiveFrom: string; effectiveTo: string | null; jobTitle: string; recordedAt: string }[] | null;
}
interface Person {
  id: string;
  version: number;
  created_at: string;
  created_by: string;
  versions: Version[];
  employments: Employment[];
}

export default function PersonPage() {
  const { id } = useParams<{ id: string }>();
  const person = useApi<Person>(`/v1/people/${id}`);
  const entities = useApi<{ items: { id: string; legal_name_en: string }[] }>("/v1/legal-entities");
  const versionAction = useAction();
  const employmentAction = useAction();
  const current = person.data?.versions.find((v) => v.effective_to === null) ?? person.data?.versions.at(-1);
  const [v, setV] = useState({ legalNameEn: "", legalNameBn: "", birthDate: "", effectiveFrom: todayInDhaka() });
  const [emp, setEmp] = useState({ legalEntityId: "", employeeCode: "", hireDate: todayInDhaka(), jobTitle: "" });

  useEffect(() => {
    if (current) setV((s) => ({ ...s, legalNameEn: current.legal_name_en, legalNameBn: current.legal_name_bn ?? "", birthDate: current.birth_date ?? "" }));
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <PageHeader
        title={current?.legal_name_en ?? "Person"}
        subtitle={
          <>
            <Link href="/people">← People</Link> · {current?.legal_name_bn ?? ""} · aggregate version {person.data?.version ?? "…"} ·{" "}
            <Link href={`/audit?resourceId=${id}`}>audit trail for this person</Link>
          </>
        }
      />
      <ErrorBox error={person.error} />
      <Loading show={person.loading} />
      {person.data ? (
        <div className="grid">
          <Card title="Version history (effective dated, append-only)">
            <ul className="timeline">
              {person.data.versions.map((ver) => (
                <li key={ver.id}>
                  <strong>
                    {ver.effective_from} → {ver.effective_to ?? "open"}
                  </strong>
                  <div>
                    {ver.legal_name_en} {ver.legal_name_bn ? `· ${ver.legal_name_bn}` : ""} {ver.preferred_name ? `· “${ver.preferred_name}”` : ""}
                  </div>
                  <div className="muted">
                    Birth date {ver.birth_date ?? "—"} · recorded {dateTime(ver.recorded_at)} by <code>{ver.recorded_by}</code>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Employments">
            {person.data.employments.length === 0 ? <p className="empty">No employments you are allowed to see.</p> : null}
            {person.data.employments.map((e) => (
              <div key={e.id} style={{ marginBottom: 12 }}>
                <strong>{e.employee_code}</strong> · {e.legal_entity_name} · hired {e.hire_date}
                {e.end_date ? ` · ended ${e.end_date}` : ""}
                <ul className="timeline" style={{ marginTop: 6 }}>
                  {(e.versions ?? []).map((ev) => (
                    <li key={ev.id}>
                      {ev.effectiveFrom} → {ev.effectiveTo ?? "open"}: {ev.jobTitle}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </Card>
        </div>
      ) : null}

      {person.data ? (
        <div className="grid">
          <Card title="Add a version">
            <p className="muted">Closes the open version the day before. Sends expected version {person.data.version}; a stale page gets a 409.</p>
            <form
              className="inline"
              onSubmit={(e) => {
                e.preventDefault();
                void versionAction.post(
                  `/v1/people/${id}/versions`,
                  { expectedVersion: person.data!.version, legalNameEn: v.legalNameEn, effectiveFrom: v.effectiveFrom, ...(v.legalNameBn ? { legalNameBn: v.legalNameBn } : {}), ...(v.birthDate ? { birthDate: v.birthDate } : {}) },
                  "Version added and audited.",
                  () => person.reload(),
                );
              }}
            >
              <Field label="Legal name (English)">
                <input required value={v.legalNameEn} onChange={(e) => setV({ ...v, legalNameEn: e.target.value })} />
              </Field>
              <Field label="Legal name (Bangla)">
                <input lang="bn" value={v.legalNameBn} onChange={(e) => setV({ ...v, legalNameBn: e.target.value })} />
              </Field>
              <Field label="Birth date">
                <input type="date" value={v.birthDate} onChange={(e) => setV({ ...v, birthDate: e.target.value })} />
              </Field>
              <Field label="Effective from">
                <input type="date" required value={v.effectiveFrom} onChange={(e) => setV({ ...v, effectiveFrom: e.target.value })} />
              </Field>
              <button disabled={versionAction.busy}>Add version</button>
            </form>
            <ActionStatus action={versionAction} />
          </Card>
          <Card title="Add an employment">
            <ErrorBox error={entities.error} />
            <form
              className="inline"
              onSubmit={(e) => {
                e.preventDefault();
                void employmentAction.post("/v1/employments", { personId: id, ...emp }, "Employment created and audited.", () => person.reload());
              }}
            >
              <Field label="Legal entity">
                <select required value={emp.legalEntityId} onChange={(e) => setEmp({ ...emp, legalEntityId: e.target.value })}>
                  <option value="">Choose…</option>
                  {(entities.data?.items ?? []).map((le) => (
                    <option key={le.id} value={le.id}>
                      {le.legal_name_en}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Employee code">
                <input required pattern="[A-Za-z0-9][A-Za-z0-9._/\-]{0,39}" value={emp.employeeCode} onChange={(e) => setEmp({ ...emp, employeeCode: e.target.value })} />
              </Field>
              <Field label="Hire date">
                <input type="date" required value={emp.hireDate} onChange={(e) => setEmp({ ...emp, hireDate: e.target.value })} />
              </Field>
              <Field label="Job title">
                <input required value={emp.jobTitle} onChange={(e) => setEmp({ ...emp, jobTitle: e.target.value })} />
              </Field>
              <button disabled={employmentAction.busy}>Create</button>
            </form>
            <ActionStatus action={employmentAction} />
          </Card>
        </div>
      ) : null}
    </>
  );
}
