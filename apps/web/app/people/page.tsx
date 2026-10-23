"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { todayInDhaka, useAction, useApi } from "@/lib/api";
import { ActionStatus } from "@/components/ActionStatus";
import { Card, Empty, ErrorBox, Field, Loading, PageHeader } from "@/components/ui";

interface PersonRow {
  id: string;
  version: number;
  legal_name_en: string;
  legal_name_bn: string | null;
  preferred_name: string | null;
  current_since: string;
  employments: number;
}
interface Employment {
  id: string;
  person_id: string;
  person_name: string;
  legal_entity_name: string;
  employee_code: string;
  hire_date: string;
  end_date: string | null;
  job_title: string | null;
}

export default function PeoplePage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [history, setHistory] = useState<(string | null)[]>([]);
  const params = new URLSearchParams({ limit: "10" });
  if (query) params.set("q", query);
  if (cursor) params.set("cursor", cursor);
  const people = useApi<{ items: PersonRow[]; nextCursor: string | null }>(`/v1/people?${params.toString()}`);
  const employments = useApi<{ items: Employment[] }>("/v1/employments?limit=50");
  const action = useAction();
  const [form, setForm] = useState({ legalNameEn: "", legalNameBn: "", birthDate: "", effectiveFrom: todayInDhaka() });

  return (
    <>
      <PageHeader title="People" subtitle="Person records with effective-dated history (EMP-01, EMP-08). Names shown are the version in force today." />
      <Card
        title="People"
        actions={
          <form
            className="inline"
            onSubmit={(e) => {
              e.preventDefault();
              setCursor(null);
              setHistory([]);
              setQuery(search.trim());
            }}
          >
            <input aria-label="Search people" placeholder="Search name (English or বাংলা)" value={search} onChange={(e) => setSearch(e.target.value)} />
            <button className="secondary">Search</button>
          </form>
        }
      >
        <ErrorBox error={people.error} />
        <Loading show={people.loading} />
        {people.data && people.data.items.length === 0 ? <Empty>No people found.</Empty> : null}
        {people.data && people.data.items.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>নাম</th>
                  <th>Current since</th>
                  <th className="num">Versions</th>
                  <th className="num">Employments</th>
                </tr>
              </thead>
              <tbody>
                {people.data.items.map((p) => (
                  <tr key={p.id} className="clickable" onClick={() => router.push(`/people/${p.id}`)}>
                    <td>
                      <Link href={`/people/${p.id}`}>{p.legal_name_en}</Link>
                    </td>
                    <td>{p.legal_name_bn ?? "—"}</td>
                    <td>{p.current_since}</td>
                    <td className="num">{p.version}</td>
                    <td className="num">{p.employments}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <div className="actions" style={{ marginTop: 10 }}>
          <button
            className="secondary"
            disabled={history.length === 0}
            onClick={() => {
              setCursor(history[history.length - 1] ?? null);
              setHistory(history.slice(0, -1));
            }}
          >
            Previous
          </button>
          <button
            className="secondary"
            disabled={!people.data?.nextCursor}
            onClick={() => {
              setHistory([...history, cursor]);
              setCursor(people.data?.nextCursor ?? null);
            }}
          >
            Next
          </button>
        </div>
      </Card>

      <Card title="Add a person">
        <form
          className="inline"
          onSubmit={(e) => {
            e.preventDefault();
            void action.post<{ personId: string }>(
              "/v1/people",
              {
                legalNameEn: form.legalNameEn,
                effectiveFrom: form.effectiveFrom,
                ...(form.legalNameBn ? { legalNameBn: form.legalNameBn } : {}),
                ...(form.birthDate ? { birthDate: form.birthDate } : {}),
              },
              "Person created (person + first version + audit event in one transaction).",
              (r) => router.push(`/people/${r.personId}`),
            );
          }}
        >
          <Field label="Legal name (English)">
            <input required maxLength={300} value={form.legalNameEn} onChange={(e) => setForm({ ...form, legalNameEn: e.target.value })} />
          </Field>
          <Field label="Legal name (Bangla)">
            <input lang="bn" maxLength={300} value={form.legalNameBn} onChange={(e) => setForm({ ...form, legalNameBn: e.target.value })} />
          </Field>
          <Field label="Birth date" hint="HR-restricted field">
            <input type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} />
          </Field>
          <Field label="Effective from">
            <input type="date" required value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} />
          </Field>
          <button disabled={action.busy || !form.legalNameEn.trim()}>Create</button>
        </form>
        <p className="muted">Use synthetic names only. Real employee data must never be entered here (NFR-12).</p>
        <ActionStatus action={action} />
      </Card>

      <Card title="Employments you can see">
        <p className="muted">Rows are filtered per legal entity by your employment:view grants.</p>
        <ErrorBox error={employments.error} />
        {employments.data ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Person</th>
                  <th>Legal entity</th>
                  <th>Job title</th>
                  <th>Hired</th>
                  <th>Ended</th>
                </tr>
              </thead>
              <tbody>
                {employments.data.items.map((e) => (
                  <tr key={e.id}>
                    <td className="mono">{e.employee_code}</td>
                    <td>{e.person_name}</td>
                    <td>{e.legal_entity_name}</td>
                    <td>{e.job_title ?? "—"}</td>
                    <td>{e.hire_date}</td>
                    <td>{e.end_date ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>
    </>
  );
}
