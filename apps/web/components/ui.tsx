"use client";

import type { ReactNode } from "react";
import type { ApiFailure } from "@/lib/api";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p className="muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="actions">{actions}</div> : null}
    </header>
  );
}

export function Card({ title, children, actions }: { title?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="card">
      {title || actions ? (
        <div className="card-head">
          {title ? <h2>{title}</h2> : <span />}
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function ErrorBox({ error }: { error: ApiFailure | null }) {
  if (!error) return null;
  return (
    <div className="error" role="alert">
      <strong>{error.code}</strong> {error.message}
      {error.correlationId ? <span className="muted"> · correlation {error.correlationId.slice(0, 8)}</span> : null}
    </div>
  );
}

export function Loading({ show }: { show: boolean }) {
  return show ? <p className="muted" aria-live="polite">Loading…</p> : null;
}

const TONES: Record<string, string> = {
  Passed: "ok", success: "ok", active: "ok", calculated: "ok", "In force": "ok",
  "In progress": "warn", invited: "warn", warning: "warn", suspended: "warn",
  Planned: "neutral", Ended: "neutral",
  denied: "bad", failed: "bad", revoked: "bad", blocked: "bad", blocking: "bad",
};

export function Badge({ children, tone }: { children: string; tone?: string }) {
  return <span className={`badge ${tone ?? TONES[children] ?? "neutral"}`}>{children}</span>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint ? <small className="muted">{hint}</small> : null}
    </label>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

export function Json({ value }: { value: unknown }) {
  return <pre className="json">{JSON.stringify(value, null, 2)}</pre>;
}

export function shortId(id: string | null | undefined): string {
  return id ? id.slice(0, 8) : "—";
}

export function dateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "medium" }) + " BDT";
}
