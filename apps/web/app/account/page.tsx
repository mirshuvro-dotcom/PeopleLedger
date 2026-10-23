"use client";

import Link from "next/link";
import { useState } from "react";
import { apiFetch, ApiFailure, useApi } from "@/lib/api";
import { useIdentity } from "@/components/IdentityProvider";
import { Badge, Card, dateTime, ErrorBox, Field, PageHeader } from "@/components/ui";

interface SessionRow {
  id: string;
  tenantName: string;
  createdAt: string;
  lastSeenAt: string;
  active: boolean;
  ipAddress: string | null;
  userAgent: string | null;
  revokedReason: string | null;
}

/** IAM-01 (MFA, password), IAM-05 (sessions), SEC-05 (enrolment for privileged users). */
export default function AccountPage() {
  const { session, refreshSession } = useIdentity();
  const mfa = useApi<{ enabled: boolean; sessionVerified: boolean; enrollmentRequired: boolean }>(session ? "/auth/mfa" : null);
  const sessions = useApi<{ currentSessionId: string; items: SessionRow[] }>(session ? "/auth/sessions" : null);
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [error, setError] = useState<ApiFailure | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const act = async (fn: () => Promise<void>) => {
    setError(null);
    setMessage(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiFailure ? e : new ApiFailure(0, "NETWORK", "The API is not reachable.", ""));
    }
  };

  if (!session) {
    return (
      <>
        <PageHeader title="My account" />
        <Card>
          <p>
            Account settings need a real sign-in. <Link href="/login">Sign in</Link> (the developer identity switcher has no account to manage).
          </p>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="My account" subtitle={`${session.email} · ${session.tenantName}`} />
      <div aria-live="polite">
        <ErrorBox error={error} />
        {error?.details.length ? (
          <ul>
            {error.details.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        ) : null}
        {message ? <div className="success">{message}</div> : null}
      </div>

      <Card title="Two-factor authentication">
        {mfa.data?.enabled ? (
          <p>
            <Badge tone="ok">enabled</Badge> An authenticator app is required at every sign-in. Keep your recovery codes somewhere safe.
          </p>
        ) : recoveryCodes ? null : setup ? (
          <form
            className="auth-card"
            onSubmit={(e) => {
              e.preventDefault();
              void act(async () => {
                const r = await apiFetch<{ recoveryCodes: string[] }>("/auth/mfa/totp/confirm", null, { method: "POST", body: { code } });
                setRecoveryCodes(r.recoveryCodes);
                setSetup(null);
                await refreshSession();
                mfa.reload();
              });
            }}
          >
            <p>In your authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…), add an account manually with this key:</p>
            <div className="secret">{setup.secret.replace(/(.{4})/g, "$1 ").trim()}</div>
            <details>
              <summary className="muted">Setup URI (for apps that accept a link)</summary>
              <code style={{ wordBreak: "break-all" }}>{setup.otpauthUri}</code>
            </details>
            <Field label="Enter the 6-digit code the app shows">
              <input inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} />
            </Field>
            <button>Confirm and turn on</button>
          </form>
        ) : (
          <>
            <p>
              {mfa.data?.enrollmentRequired ? <Badge tone="bad">required for your role</Badge> : <Badge tone="warn">not set up</Badge>} Protect your account with an authenticator app.
            </p>
            <button onClick={() => void act(async () => setSetup(await apiFetch("/auth/mfa/totp/setup", null, { method: "POST" })))}>Set up authenticator app</button>
          </>
        )}
        {recoveryCodes ? (
          <div className="auth-card">
            <div className="success">Two-factor authentication is on.</div>
            <p>
              <strong>Save these recovery codes now.</strong> Each works once if you lose your phone. They will not be shown again.
            </p>
            <div className="codes">
              {recoveryCodes.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
          </div>
        ) : null}
      </Card>

      <Card title="Change password">
        <form
          className="inline"
          onSubmit={(e) => {
            e.preventDefault();
            if (pw.next !== pw.confirm) {
              setError(new ApiFailure(400, "MISMATCH", "The new passwords do not match.", ""));
              return;
            }
            void act(async () => {
              await apiFetch("/auth/password", null, { method: "POST", body: { currentPassword: pw.current, newPassword: pw.next } });
              setPw({ current: "", next: "", confirm: "" });
              setMessage("Password changed. Your other sessions were signed out.");
              sessions.reload();
            });
          }}
        >
          <Field label="Current password">
            <input type="password" autoComplete="current-password" required value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          </Field>
          <Field label="New password" hint="At least 12 characters">
            <input type="password" autoComplete="new-password" required minLength={12} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          </Field>
          <Field label="Repeat new password">
            <input type="password" autoComplete="new-password" required value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
          </Field>
          <button>Change password</button>
        </form>
      </Card>

      <Card title="Sessions">
        <p className="muted">
          This session ends after {Math.round((new Date(session.idleExpiresAt).getTime() - Date.now()) / 60000)} minutes without activity, and at the latest at {dateTime(session.absoluteExpiresAt)}.
        </p>
        <ErrorBox error={sessions.error} />
        {sessions.data ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Organisation</th>
                  <th>Signed in</th>
                  <th>Last activity</th>
                  <th>Address</th>
                  <th>State</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sessions.data.items.map((s) => (
                  <tr key={s.id}>
                    <td>
                      {s.tenantName} {s.id === sessions.data?.currentSessionId ? <Badge tone="ok">this session</Badge> : null}
                    </td>
                    <td>{dateTime(s.createdAt)}</td>
                    <td>{dateTime(s.lastSeenAt)}</td>
                    <td className="mono">{s.ipAddress ?? "—"}</td>
                    <td>{s.active ? <Badge tone="ok">active</Badge> : <Badge tone="neutral">{s.revokedReason ?? "expired"}</Badge>}</td>
                    <td>
                      {s.active && s.id !== sessions.data?.currentSessionId ? (
                        <button className="secondary" onClick={() => void act(async () => {
                          await apiFetch(`/auth/sessions/${s.id}/revoke`, null, { method: "POST" });
                          setMessage("Session signed out.");
                          sessions.reload();
                        })}>
                          Sign out
                        </button>
                      ) : null}
                    </td>
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
