"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { apiFetch, ApiFailure } from "@/lib/api";
import { Card, ErrorBox, Field } from "@/components/ui";

function SetupForm() {
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<ApiFailure | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (done) {
    return (
      <div className="success">
        Password set for {done}. <Link href="/login">Sign in now</Link>.
      </div>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (password !== confirm) {
          setError(new ApiFailure(400, "MISMATCH", "The two passwords do not match.", ""));
          return;
        }
        setBusy(true);
        setError(null);
        apiFetch<{ email: string }>("/auth/setup", null, { method: "POST", body: { token, password } })
          .then((r) => setDone(r.email), (err: unknown) => setError(err instanceof ApiFailure ? err : null))
          .finally(() => setBusy(false));
      }}
    >
      {!token ? <div className="error">This page needs the link your administrator gave you.</div> : null}
      <Field label="New password" hint="At least 12 characters. A few unrelated words make a strong, memorable passphrase.">
        <input type="password" autoComplete="new-password" required minLength={12} value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Field label="Repeat the password">
        <input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      <button disabled={busy || !token}>Set password</button>
      <ErrorBox error={error} />
      {error?.details.length ? (
        <ul>
          {error.details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}

/** IAM-01: redeem a one-time setup or reset link. */
export default function SetupPage() {
  return (
    <div className="auth-card">
      <h1>Set your password</h1>
      <Card>
        <Suspense fallback={<p className="muted">Loading…</p>}>
          <SetupForm />
        </Suspense>
      </Card>
    </div>
  );
}
