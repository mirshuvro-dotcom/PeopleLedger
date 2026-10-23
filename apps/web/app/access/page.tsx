"use client";

import { useState } from "react";
import { todayInDhaka, useAction, useApi } from "@/lib/api";
import { ActionStatus } from "@/components/ActionStatus";
import { Badge, Card, ErrorBox, Field, Loading, PageHeader } from "@/components/ui";

interface Member {
  id: string;
  user_id: string;
  email: string;
  status: string;
  version: number;
}
interface Role {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
}
interface Assignment {
  id: string;
  email: string;
  role_name: string;
  scope_type: string;
  scope_legal_entity_name: string | null;
  effective_from: string;
  effective_to: string | null;
  reason: string;
  version: number;
  in_force: boolean;
}
interface Permission {
  code: string;
  description: string;
  sensitivity: string;
}
interface Check {
  allowed: boolean;
  asOf: string;
  grants: { role_name: string; scope_type: string; scope_legal_entity_name: string | null; effective_from: string; effective_to: string | null; in_force: boolean; membership_status: string }[];
}

const NEXT_STATUS: Record<string, string[]> = { invited: ["active", "revoked"], active: ["suspended", "revoked"], suspended: ["active", "revoked"], revoked: [] };

export default function AccessPage() {
  const members = useApi<{ items: Member[] }>("/v1/members");
  const roles = useApi<{ items: Role[] }>("/v1/roles");
  const assignments = useApi<{ items: Assignment[] }>("/v1/role-assignments");
  const permissions = useApi<{ items: Permission[] }>("/v1/permissions");
  const entities = useApi<{ items: { id: string; legal_name_en: string }[] }>("/v1/legal-entities");
  const memberAction = useAction();
  const roleAction = useAction();
  const assignAction = useAction();
  const [email, setEmail] = useState("");
  const [roleName, setRoleName] = useState("");
  const [rolePerms, setRolePerms] = useState<string[]>([]);
  const [assign, setAssign] = useState({ membershipId: "", roleId: "", scopeType: "tenant", legalEntityId: "", effectiveFrom: todayInDhaka(), reason: "" });
  const [check, setCheck] = useState({ userId: "", permission: "person:view", legalEntityId: "" });
  const checkPath = check.userId ? `/v1/permission-check?${new URLSearchParams({ userId: check.userId, permission: check.permission, ...(check.legalEntityId ? { legalEntityId: check.legalEntityId } : {}) }).toString()}` : null;
  const checkResult = useApi<Check>(checkPath);

  return (
    <>
      <PageHeader title="Access & roles" subtitle="Memberships, tenant roles and scoped, effective-dated role assignments (SEC-01, RBAC-01..06). Nobody can change their own access." />

      <Card title="Members">
        <ErrorBox error={members.error} />
        <Loading show={members.loading} />
        {members.data ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Status</th>
                  <th className="num">Version</th>
                  <th>Change status</th>
                </tr>
              </thead>
              <tbody>
                {members.data.items.map((m) => (
                  <tr key={m.id}>
                    <td>{m.email}</td>
                    <td>
                      <Badge>{m.status}</Badge>
                    </td>
                    <td className="num">{m.version}</td>
                    <td>
                      <div className="actions">
                        {(NEXT_STATUS[m.status] ?? []).map((s) => (
                          <button
                            key={s}
                            className="secondary"
                            disabled={memberAction.busy}
                            onClick={() =>
                              void memberAction.post(`/v1/members/${m.id}/status`, { status: s, expectedVersion: m.version, reason: "Changed in developer console" }, `${m.email} → ${s}`, () => members.reload())
                            }
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <form
          className="inline"
          style={{ marginTop: 12 }}
          onSubmit={(e) => {
            e.preventDefault();
            void memberAction.post("/v1/members", { email }, `Invited ${email}.`, () => {
              setEmail("");
              members.reload();
            });
          }}
        >
          <Field label="Invite by email (synthetic, e.g. name@example.test)">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <button disabled={memberAction.busy}>Invite</button>
        </form>
        <ActionStatus action={memberAction} />
      </Card>

      <Card title="Roles">
        <ErrorBox error={roles.error} />
        {roles.data ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Permissions</th>
                </tr>
              </thead>
              <tbody>
                {roles.data.items.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.name}</strong>
                      <div className="muted">{r.description}</div>
                    </td>
                    <td className="mono">{r.permissions.join(", ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {permissions.data ? (
          <form
            style={{ marginTop: 12 }}
            onSubmit={(e) => {
              e.preventDefault();
              void roleAction.post("/v1/roles", { name: roleName, permissions: rolePerms }, `Role "${roleName}" created.`, () => {
                setRoleName("");
                setRolePerms([]);
                roles.reload();
              });
            }}
          >
            <Field label="New role name">
              <input required maxLength={120} value={roleName} onChange={(e) => setRoleName(e.target.value)} />
            </Field>
            <div className="checks" style={{ margin: "10px 0" }}>
              {permissions.data.items.map((p) => (
                <label key={p.code} title={`${p.description} (${p.sensitivity})`}>
                  <input
                    type="checkbox"
                    checked={rolePerms.includes(p.code)}
                    onChange={(e) => setRolePerms(e.target.checked ? [...rolePerms, p.code] : rolePerms.filter((c) => c !== p.code))}
                  />
                  <code>{p.code}</code>
                </label>
              ))}
            </div>
            <button disabled={roleAction.busy || !roleName.trim()}>Create role</button>
          </form>
        ) : null}
        <ActionStatus action={roleAction} />
      </Card>

      <Card title="Role assignments">
        <ErrorBox error={assignments.error} />
        {assignments.data ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Role</th>
                  <th>Scope</th>
                  <th>Effective</th>
                  <th>State</th>
                  <th>Reason</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {assignments.data.items.map((a) => (
                  <tr key={a.id}>
                    <td>{a.email}</td>
                    <td>{a.role_name}</td>
                    <td>{a.scope_type === "tenant" ? "Whole tenant" : a.scope_legal_entity_name}</td>
                    <td>
                      {a.effective_from} → {a.effective_to ?? "open"}
                    </td>
                    <td>
                      <Badge>{a.in_force ? "In force" : "Ended"}</Badge>
                    </td>
                    <td className="muted">{a.reason}</td>
                    <td>
                      {a.effective_to === null ? (
                        <button
                          className="secondary"
                          disabled={assignAction.busy}
                          onClick={() =>
                            void assignAction.post(`/v1/role-assignments/${a.id}/end`, { expectedVersion: a.version, effectiveTo: todayInDhaka(), reason: "Ended in developer console" }, "Assignment ended today.", () =>
                              assignments.reload(),
                            )
                          }
                        >
                          End today
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {members.data && roles.data ? (
          <form
            className="inline"
            style={{ marginTop: 12 }}
            onSubmit={(e) => {
              e.preventDefault();
              void assignAction.post(
                "/v1/role-assignments",
                {
                  membershipId: assign.membershipId,
                  roleId: assign.roleId,
                  scope: assign.scopeType === "tenant" ? { type: "tenant" } : { type: "legal_entity", legalEntityId: assign.legalEntityId },
                  effectiveFrom: assign.effectiveFrom,
                  reason: assign.reason,
                },
                "Role assigned and audited.",
                () => assignments.reload(),
              );
            }}
          >
            <Field label="Member">
              <select required value={assign.membershipId} onChange={(e) => setAssign({ ...assign, membershipId: e.target.value })}>
                <option value="">Choose…</option>
                {members.data.items.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.email}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Role">
              <select required value={assign.roleId} onChange={(e) => setAssign({ ...assign, roleId: e.target.value })}>
                <option value="">Choose…</option>
                {roles.data.items.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Scope">
              <select value={assign.scopeType} onChange={(e) => setAssign({ ...assign, scopeType: e.target.value })}>
                <option value="tenant">Whole tenant</option>
                <option value="legal_entity">One legal entity</option>
              </select>
            </Field>
            {assign.scopeType === "legal_entity" ? (
              <Field label="Legal entity">
                <select required value={assign.legalEntityId} onChange={(e) => setAssign({ ...assign, legalEntityId: e.target.value })}>
                  <option value="">Choose…</option>
                  {(entities.data?.items ?? []).map((le) => (
                    <option key={le.id} value={le.id}>
                      {le.legal_name_en}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
            <Field label="Effective from">
              <input type="date" required value={assign.effectiveFrom} onChange={(e) => setAssign({ ...assign, effectiveFrom: e.target.value })} />
            </Field>
            <Field label="Reason">
              <input required maxLength={1000} value={assign.reason} onChange={(e) => setAssign({ ...assign, reason: e.target.value })} />
            </Field>
            <button disabled={assignAction.busy}>Assign</button>
          </form>
        ) : null}
        <ActionStatus action={assignAction} />
      </Card>

      <Card title="Why can (or can't) this user do it?">
        <form className="inline" onSubmit={(e) => e.preventDefault()}>
          <Field label="User">
            <select value={check.userId} onChange={(e) => setCheck({ ...check, userId: e.target.value })}>
              <option value="">Choose…</option>
              {(members.data?.items ?? []).map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.email}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Permission">
            <select value={check.permission} onChange={(e) => setCheck({ ...check, permission: e.target.value })}>
              {(permissions.data?.items ?? []).map((p) => (
                <option key={p.code}>{p.code}</option>
              ))}
            </select>
          </Field>
          <Field label="Legal entity (optional)">
            <select value={check.legalEntityId} onChange={(e) => setCheck({ ...check, legalEntityId: e.target.value })}>
              <option value="">— tenant-wide —</option>
              {(entities.data?.items ?? []).map((le) => (
                <option key={le.id} value={le.id}>
                  {le.legal_name_en}
                </option>
              ))}
            </select>
          </Field>
        </form>
        <ErrorBox error={checkResult.error} />
        {checkPath && checkResult.data ? (
          <div style={{ marginTop: 10 }}>
            <p>
              Decision on {checkResult.data.asOf}: {checkResult.data.allowed ? <Badge tone="ok">ALLOWED</Badge> : <Badge tone="bad">DENIED</Badge>}
            </p>
            {checkResult.data.grants.length === 0 ? (
              <p className="muted">No role of this user carries the permission, so access is denied by default.</p>
            ) : (
              <ul>
                {checkResult.data.grants.map((g, i) => (
                  <li key={i}>
                    {g.role_name} · {g.scope_type === "tenant" ? "whole tenant" : g.scope_legal_entity_name} · {g.effective_from} → {g.effective_to ?? "open"} · {g.in_force ? "in force" : "not in force"} · membership {g.membership_status}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </Card>
    </>
  );
}
