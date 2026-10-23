"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch, ApiFailure } from "@/lib/api";
import { useIdentity } from "@/components/IdentityProvider";
import { Card, ErrorBox, Field } from "@/components/ui";

type Step = "password" | "mfa" | "tenant";
interface ChallengeState {
  mfaRequired: boolean;
  mfaVerified: boolean;
  tenants: { tenantId: string; name: string }[];
}

/** IAM-01 / IAM-04: password, then authenticator code (if enrolled), then organisation. */
export default function LoginPage() {
  const router = useRouter();
  const { refreshSession } = useIdentity();
  const [step, setStep] = useState<Step>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [tenants, setTenants] = useState<ChallengeState["tenants"]>([]);
  const [error, setError] = useState<ApiFailure | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiFailure ? e : new ApiFailure(0, "NETWORK", "The API is not reachable.", ""));
    } finally {
      setBusy(false);
    }
  };

  const chooseTenant = async (tenantId: string) => {
    await apiFetch("/auth/tenant", null, { method: "POST", body: { tenantId } });
    await refreshSession();
    router.push("/");
  };

  const afterFactors = async (state: ChallengeState) => {
    if (state.tenants.length === 1) return chooseTenant(state.tenants[0]!.tenantId);
    if (state.tenants.length === 0) throw new ApiFailure(403, "NO_ORGANISATION", "Your account has no active organisation. Ask an administrator.", "");
    setTenants(state.tenants);
    setStep("tenant");
  };

  return (
    <div className="auth-card">
      <h1>Sign in to PeopleLedger</h1>
      <Card>
        {step === "password" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const r = await apiFetch<{ mfaRequired: boolean }>("/auth/login", null, { method: "POST", body: { email, password } });
                setPassword("");
                if (r.mfaRequired) setStep("mfa");
                else await afterFactors(await apiFetch<ChallengeState>("/auth/challenge", null));
              });
            }}
          >
            <Field label="Email">
              <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Password">
              <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <button disabled={busy}>Continue</button>
          </form>
        ) : null}

        {step === "mfa" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const state = await apiFetch<ChallengeState>("/auth/mfa", null, { method: "POST", body: useRecovery ? { recoveryCode: code } : { code } });
                await afterFactors(state);
              });
            }}
          >
            <p className="muted">{useRecovery ? "Enter one of your recovery codes. Each works only once." : "Enter the 6-digit code from your authenticator app."}</p>
            <Field label={useRecovery ? "Recovery code" : "Authentication code"}>
              <input
                autoComplete="one-time-code"
                inputMode={useRecovery ? "text" : "numeric"}
                pattern={useRecovery ? undefined : "\\d{6}"}
                maxLength={useRecovery ? 20 : 6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </Field>
            <button disabled={busy}>Verify</button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setUseRecovery(!useRecovery);
                setCode("");
              }}
            >
              {useRecovery ? "Use the authenticator app instead" : "Use a recovery code"}
            </button>
          </form>
        ) : null}

        {step === "tenant" ? (
          <div className="auth-card">
            <p className="muted">Choose the organisation to work in. Each organisation is a separate session.</p>
            {tenants.map((t) => (
              <button key={t.tenantId} disabled={busy} onClick={() => void run(() => chooseTenant(t.tenantId))}>
                {t.name}
              </button>
            ))}
          </div>
        ) : null}
        <div style={{ marginTop: 12 }}>
          <ErrorBox error={error} />
        </div>
      </Card>
      <p className="muted">
        No password yet? Ask your administrator for a setup link. Development: <code>pnpm dev:setup</code> prints the shared synthetic password. <Link href="/">Back to the console</Link>
      </p>
    </div>
  );
}
