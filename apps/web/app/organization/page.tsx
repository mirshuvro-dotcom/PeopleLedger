"use client";

import { useState } from "react";
import { useAction, useApi } from "@/lib/api";
import { ActionStatus } from "@/components/ActionStatus";
import { Badge, Card, dateTime, Empty, ErrorBox, Field, Loading, PageHeader, shortId } from "@/components/ui";

interface Tenant {
  id: string;
  name: string;
  environment: string;
  status: string;
  created_at: string;
}
interface LegalEntity {
  id: string;
  legal_name_en: string;
  legal_name_bn: string | null;
  status: string;
  production_payroll_enabled: boolean;
  version: number;
  created_at: string;
}

export default function OrganizationPage() {
  const tenant = useApi<Tenant>("/v1/tenant");
  const entities = useApi<{ items: LegalEntity[] }>("/v1/legal-entities");
  const action = useAction();
  const [en, setEn] = useState("");
  const [bn, setBn] = useState("");

  return (
    <>
      <PageHeader title="Organization" subtitle="Tenant and legal entities (ORG-01). Production payroll stays disabled on every entity (ORG-08)." />
      <Card title="Tenant">
        <ErrorBox error={tenant.error} />
        {tenant.data ? (
          <p>
            <strong>{tenant.data.name}</strong> · {tenant.data.environment} · <Badge>{tenant.data.status}</Badge> · id <code>{shortId(tenant.data.id)}</code> · created {dateTime(tenant.data.created_at)}
          </p>
        ) : null}
      </Card>
      <Card title="Legal entities">
        <ErrorBox error={entities.error} />
        <Loading show={entities.loading} />
        {entities.data && entities.data.items.length === 0 ? <Empty>No legal entities.</Empty> : null}
        {entities.data && entities.data.items.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name (English)</th>
                  <th>নাম (বাংলা)</th>
                  <th>Status</th>
                  <th>Production payroll</th>
                  <th>Version</th>
                  <th>ID</th>
                </tr>
              </thead>
              <tbody>
                {entities.data.items.map((e) => (
                  <tr key={e.id}>
                    <td>{e.legal_name_en}</td>
                    <td>{e.legal_name_bn ?? "—"}</td>
                    <td>
                      <Badge>{e.status}</Badge>
                    </td>
                    <td>{e.production_payroll_enabled ? <Badge tone="bad">enabled</Badge> : <Badge tone="neutral">disabled</Badge>}</td>
                    <td className="num">{e.version}</td>
                    <td className="mono">{shortId(e.id)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>
      <Card title="Add a legal entity">
        <form
          className="inline"
          onSubmit={(e) => {
            e.preventDefault();
            void action.post("/v1/legal-entities", { legalNameEn: en, ...(bn ? { legalNameBn: bn } : {}) }, "Legal entity created and audited.", () => {
              setEn("");
              setBn("");
              entities.reload();
            });
          }}
        >
          <Field label="Legal name (English)">
            <input required maxLength={300} value={en} onChange={(e) => setEn(e.target.value)} />
          </Field>
          <Field label="Legal name (Bangla, optional)">
            <input maxLength={300} value={bn} onChange={(e) => setBn(e.target.value)} lang="bn" />
          </Field>
          <button disabled={action.busy || !en.trim()}>Create</button>
        </form>
        <ActionStatus action={action} />
      </Card>
    </>
  );
}
