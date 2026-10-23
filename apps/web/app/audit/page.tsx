"use client";

import { useSearchParams } from "next/navigation";
import { Fragment, Suspense, useState } from "react";
import { apiFetch, ApiFailure, useApi } from "@/lib/api";
import { useIdentity } from "@/components/IdentityProvider";
import { Badge, Card, dateTime, ErrorBox, Field, Json, Loading, PageHeader } from "@/components/ui";

interface AuditEvent {
  seq: string;
  id: string;
  occurred_at: string;
  recorded_at: string;
  category: string;
  action: string;
  actor_type: string;
  actor_id: string;
  resource_type: string;
  resource_id: string | null;
  result: string;
  reason: string | null;
  source: string;
  ip_address: string | null;
  user_agent: string | null;
  correlation_id: string;
  before_ref: unknown;
  after_ref: unknown;
  prev_hash: string;
  hash: string;
}
interface Verification {
  ok: boolean;
  checked: number;
  firstBadSeq: number | null;
  problem: string | null;
}

function AuditView() {
  const params = useSearchParams();
  const { identity } = useIdentity();
  const [filters, setFilters] = useState({ category: "", action: "", result: "", resourceId: params.get("resourceId") ?? "" });
  const [applied, setApplied] = useState(filters);
  const [before, setBefore] = useState<number | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [verifyError, setVerifyError] = useState<ApiFailure | null>(null);
  const q = new URLSearchParams({ limit: "25" });
  for (const [k, v] of Object.entries(applied)) if (v) q.set(k, v);
  if (before) q.set("before", String(before));
  const events = useApi<{ items: AuditEvent[]; nextBefore: number | null }>(`/v1/audit-events?${q.toString()}`);

  return (
    <>
      <PageHeader
        title="Audit log"
        subtitle="Append-only, hash-chained per tenant (AUD-01..AUD-09). Restricted fields appear only as change markers."
        actions={
          <button
            onClick={() => {
              setVerifyError(null);
              apiFetch<Verification>("/v1/audit-events/verify", identity).then(setVerification, (e: unknown) => setVerifyError(e instanceof ApiFailure ? e : null));
            }}
          >
            Verify chain integrity
          </button>
        }
      />
      <ErrorBox error={verifyError} />
      {verification ? (
        verification.ok ? (
          <div className="success">Chain intact: {verification.checked} events verified, links and hashes match, no gaps, tail matches the chain head.</div>
        ) : (
          <div className="error">
            Tampering detected at seq {verification.firstBadSeq}: {verification.problem} (checked {verification.checked}).
          </div>
        )
      ) : null}
      <Card>
        <form
          className="inline"
          onSubmit={(e) => {
            e.preventDefault();
            setBefore(null);
            setApplied(filters);
          }}
        >
          <Field label="Category">
            <select value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}>
              <option value="">All</option>
              {["security", "data-change", "configuration", "financial", "privacy", "communication", "integration", "system"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Action starts with">
            <input value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value })} placeholder="person." />
          </Field>
          <Field label="Result">
            <select value={filters.result} onChange={(e) => setFilters({ ...filters, result: e.target.value })}>
              <option value="">All</option>
              <option>success</option>
              <option>denied</option>
              <option>failed</option>
            </select>
          </Field>
          <Field label="Resource id">
            <input value={filters.resourceId} onChange={(e) => setFilters({ ...filters, resourceId: e.target.value })} />
          </Field>
          <button className="secondary">Apply</button>
        </form>
      </Card>
      <ErrorBox error={events.error} />
      <Loading show={events.loading} />
      {events.data ? (
        <Card>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="num">Seq</th>
                  <th>When</th>
                  <th>Action</th>
                  <th>Result</th>
                  <th>Actor</th>
                  <th>Resource</th>
                  <th>Hash</th>
                </tr>
              </thead>
              <tbody>
                {events.data.items.map((e) => (
                  <Fragment key={e.id}>
                    <tr className="clickable" onClick={() => setOpen(open === e.id ? null : e.id)} aria-expanded={open === e.id}>
                      <td className="num">{e.seq}</td>
                      <td>{dateTime(e.occurred_at)}</td>
                      <td>
                        <code>{e.action}</code> <span className="muted">{e.category}</span>
                      </td>
                      <td>
                        <Badge>{e.result}</Badge>
                      </td>
                      <td className="mono">{e.actor_id}</td>
                      <td>
                        {e.resource_type} <span className="mono muted">{e.resource_id?.slice(0, 24)}</span>
                      </td>
                      <td className="mono muted">{e.hash.slice(0, 10)}…</td>
                    </tr>
                    {open === e.id ? (
                      <tr>
                        <td colSpan={7}>
                          <div className="grid">
                            <div>
                              <strong>Before</strong>
                              <Json value={e.before_ref} />
                            </div>
                            <div>
                              <strong>After</strong>
                              <Json value={e.after_ref} />
                            </div>
                            <div>
                              <strong>Context</strong>
                              <Json
                                value={{
                                  reason: e.reason,
                                  source: e.source,
                                  ip: e.ip_address,
                                  userAgent: e.user_agent,
                                  correlationId: e.correlation_id,
                                  recordedAt: e.recorded_at,
                                  prevHash: e.prev_hash,
                                  hash: e.hash,
                                }}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div className="actions" style={{ marginTop: 10 }}>
            <button className="secondary" disabled={before === null} onClick={() => setBefore(null)}>
              Newest
            </button>
            <button className="secondary" disabled={!events.data.nextBefore} onClick={() => setBefore(events.data?.nextBefore ?? null)}>
              Older
            </button>
          </div>
        </Card>
      ) : null}
    </>
  );
}

export default function AuditPage() {
  return (
    <Suspense fallback={<p className="muted">Loading…</p>}>
      <AuditView />
    </Suspense>
  );
}
