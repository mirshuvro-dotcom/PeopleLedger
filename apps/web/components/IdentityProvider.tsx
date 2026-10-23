"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiFetch, ApiFailure, type Identity } from "@/lib/api";

export interface SeedUser {
  label: string;
  email: string;
  userId: string;
  membershipId: string;
  roles: string[];
  status: string;
}
export interface SeedTenant {
  tenantId: string;
  name: string;
  legalEntities: { id: string; name: string }[];
  users: SeedUser[];
}

export interface Session {
  userId: string;
  email: string;
  tenantId: string;
  tenantName: string;
  mfaVerified: boolean;
  mfaEnrollmentRequired: boolean;
  idleExpiresAt: string;
  absoluteExpiresAt: string;
}

interface IdentityState {
  /** Real signed-in session (cookie). When present, developer identity is not used. */
  session: Session | null;
  refreshSession: () => Promise<void>;
  /** Developer identity (dev only), sent as headers when there is no session. */
  identity: Identity | null;
  tenants: SeedTenant[];
  tenant: SeedTenant | null;
  user: SeedUser | null;
  setIdentity: (identity: Identity) => void;
  loadError: ApiFailure | null;
  /** True once identities have loaded (or failed); tenant calls wait for it. */
  ready: boolean;
}

const IdentityContext = createContext<IdentityState | null>(null);
const STORAGE_KEY = "peopleledger.dev.identity";

/**
 * Developer identity (stand-in for sign-in, IAM-01): choose a synthetic tenant
 * and user from `.dev-seed.json`. Kept in localStorage for convenience only.
 */
export function IdentityProvider({ children }: { children: ReactNode }) {
  const [tenants, setTenants] = useState<SeedTenant[]>([]);
  const [identity, setIdentityState] = useState<Identity | null>(null);
  const [loadError, setLoadError] = useState<ApiFailure | null>(null);
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  const refreshSession = useCallback(async () => {
    try {
      setSession(await apiFetch<Session>("/auth/session", null));
    } catch {
      setSession(null);
    }
  }, []);

  useEffect(() => {
    const devIdentities = apiFetch<{ tenants: SeedTenant[] }>("/dev/identities", null)
      .then(({ tenants }) => {
        setTenants(tenants);
        let saved: Identity | null = null;
        try {
          saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Identity | null;
        } catch {
          saved = null;
        }
        const valid = saved && tenants.some((t) => t.tenantId === saved!.tenantId && t.users.some((u) => u.userId === saved!.userId));
        const first = tenants[0];
        setIdentityState(valid ? saved : first && first.users[0] ? { tenantId: first.tenantId, userId: first.users[0].userId } : null);
      })
      .catch((e: unknown) => {
        // 404: developer identity is switched off on this server; that is fine when signing in for real.
        if (!(e instanceof ApiFailure && e.status === 404)) setLoadError(e instanceof ApiFailure ? e : new ApiFailure(0, "NETWORK", "The API is not reachable. Is `pnpm dev` running?", ""));
      });
    void Promise.all([devIdentities, refreshSession()]).finally(() => setReady(true));
  }, [refreshSession]);

  const setIdentity = useCallback((next: Identity) => {
    setIdentityState(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable: identity still works for this page view
    }
  }, []);

  const value = useMemo<IdentityState>(() => {
    const tenant = tenants.find((t) => t.tenantId === identity?.tenantId) ?? null;
    const user = tenant?.users.find((u) => u.userId === identity?.userId) ?? null;
    // A real session takes precedence: no developer headers are sent while signed in.
    return { session, refreshSession, identity: session ? null : identity, tenants, tenant: session ? null : tenant, user: session ? null : user, setIdentity, loadError, ready };
  }, [identity, tenants, setIdentity, loadError, ready, session, refreshSession]);

  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>;
}

export function useIdentity(): IdentityState {
  const ctx = useContext(IdentityContext);
  if (!ctx) throw new Error("useIdentity outside IdentityProvider");
  return ctx;
}
