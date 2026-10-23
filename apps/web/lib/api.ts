"use client";

import { useCallback, useEffect, useState } from "react";
import { useIdentity } from "@/components/IdentityProvider";

export interface ApiErrorBody {
  error: { code: string; message: string; correlationId: string };
}

export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly correlationId: string,
  ) {
    super(message);
  }
}

export interface Identity {
  tenantId: string;
  userId: string;
}

/** Call the API through the same-origin /api proxy, sending the developer identity headers. */
export async function apiFetch<T>(path: string, identity: Identity | null, init: { method?: "GET" | "POST"; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (identity) {
    headers["x-dev-tenant-id"] = identity.tenantId;
    headers["x-dev-user-id"] = identity.userId;
  }
  if (init.body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`/api${path}`, {
    method: init.method ?? "GET",
    headers,
    cache: "no-store",
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  const text = await res.text();
  const json = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const e = (json as ApiErrorBody | null)?.error;
    throw new ApiFailure(res.status, e?.code ?? "HTTP_" + res.status, e?.message ?? res.statusText, e?.correlationId ?? "");
  }
  return json as T;
}

export interface Loadable<T> {
  data: T | null;
  error: ApiFailure | null;
  loading: boolean;
  reload: () => void;
}

/** Load a GET endpoint for the current identity; reloads when the identity or path changes. */
export function useApi<T>(path: string | null): Loadable<T> {
  const { identity, ready } = useIdentity();
  // Tenant endpoints wait until the developer identity is known, so no request goes out unauthenticated.
  const waiting = path !== null && path.startsWith("/v1/") && !ready;
  const [state, setState] = useState<{ data: T | null; error: ApiFailure | null; loading: boolean }>({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    if (path === null || waiting) return;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    apiFetch<T>(path, identity)
      .then((data) => !cancelled && setState({ data, error: null, loading: false }))
      .catch((error: unknown) => {
        if (cancelled) return;
        const failure = error instanceof ApiFailure ? error : new ApiFailure(0, "NETWORK", "The API is not reachable. Is `pnpm dev` running?", "");
        setState({ data: null, error: failure, loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [path, identity, tick, waiting]);
  return { ...state, reload };
}

/** Business date in Asia/Dhaka (NFR-11), for form defaults. */
export function todayInDhaka(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** BDT with lakh/crore grouping (RPT-19), from a decimal string. */
export function bdt(value: string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const negative = value.startsWith("-");
  const [int = "0", frac] = (negative ? value.slice(1) : value).split(".");
  const last3 = int.slice(-3);
  const rest = int.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}` : last3;
  return `${negative ? "-" : ""}৳ ${grouped}${frac ? `.${frac}` : ""}`;
}

export interface Action {
  busy: boolean;
  error: ApiFailure | null;
  message: string | null;
  /** POST to the API; on success shows `successMessage` and calls `onDone`. */
  post: <T>(path: string, body: unknown, successMessage: string | ((result: T) => string), onDone?: (result: T) => void) => Promise<void>;
}

export function useAction(): Action {
  const { identity } = useIdentity();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiFailure | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const post = useCallback(
    async <T,>(path: string, body: unknown, successMessage: string | ((result: T) => string), onDone?: (result: T) => void) => {
      setBusy(true);
      setError(null);
      setMessage(null);
      try {
        const result = await apiFetch<T>(path, identity, { method: "POST", body });
        setMessage(typeof successMessage === "function" ? successMessage(result) : successMessage);
        onDone?.(result);
      } catch (e) {
        setError(e instanceof ApiFailure ? e : new ApiFailure(0, "NETWORK", "The API is not reachable.", ""));
      } finally {
        setBusy(false);
      }
    },
    [identity],
  );
  return { busy, error, message, post };
}
