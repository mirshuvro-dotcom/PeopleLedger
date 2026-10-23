"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { useIdentity } from "./IdentityProvider";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/requirements", label: "Requirements" },
  { href: "/organization", label: "Organization" },
  { href: "/people", label: "People" },
  { href: "/access", label: "Access & roles" },
  { href: "/audit", label: "Audit log" },
  { href: "/payroll", label: "Payroll calculator" },
  { href: "/account", label: "My account" },
];

/** Pages that work without a signed-in user. */
const PUBLIC = ["/login", "/setup"];

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { tenants, identity, tenant, user, setIdentity, loadError, session, refreshSession } = useIdentity();

  if (PUBLIC.includes(pathname)) {
    return (
      <div className="public">
        <div className="dev-banner" role="note">PeopleLedger · synthetic data only in development</div>
        <main className="public-main">{children}</main>
      </div>
    );
  }

  return (
    <div className="shell">
      <div className="dev-banner" role="note">
        Developer console · synthetic data only · the developer identity switcher is a dev-only shortcut (refused in production)
      </div>
      <aside className="sidebar">
        <div className="brand">
          PeopleLedger <span className="muted">dev</span>
        </div>
        <nav aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={pathname === n.href || (n.href !== "/" && pathname.startsWith(n.href)) ? "active" : ""}>
              {n.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="main-col">
        <header className="topbar">
          {session ? (
            <>
              <span>
                Signed in as <strong>{session.email}</strong> · {session.tenantName}
              </span>
              <span className="muted roles">{session.mfaVerified ? "MFA verified" : "password only"}</span>
              <Link href="/account">Account</Link>
              <button
                className="secondary"
                onClick={async () => {
                  await apiFetch("/auth/logout", null, { method: "POST" }).catch(() => undefined);
                  await refreshSession();
                  router.push("/login");
                }}
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <label className="identity">
                <span className="muted">Developer identity</span>
                <select
                  aria-label="Acting as tenant and user"
                  value={identity ? `${identity.tenantId}|${identity.userId}` : ""}
                  onChange={(e) => {
                    const [tenantId, userId] = e.target.value.split("|");
                    if (tenantId && userId) setIdentity({ tenantId, userId });
                  }}
                  disabled={tenants.length === 0}
                >
                  {tenants.length === 0 ? <option value="">Not available — sign in</option> : null}
                  {tenants.map((t) => (
                    <optgroup key={t.tenantId} label={t.name}>
                      {t.users.map((u) => (
                        <option key={u.userId} value={`${t.tenantId}|${u.userId}`}>
                          {u.label} — {u.email}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              {user && tenant ? (
                <span className="muted roles">
                  {tenant.name} · roles: {user.roles.length ? user.roles.join(", ") : "none"} · {user.status}
                </span>
              ) : null}
              <Link href="/login">Sign in</Link>
            </>
          )}
        </header>
        {session?.mfaEnrollmentRequired ? (
          <div className="notice" role="alert">
            Your role has critical permissions, so an authenticator app is required (SEC-05). <Link href="/account">Set it up on My account</Link> to continue.
          </div>
        ) : null}
        {loadError ? (
          <div className="error" role="alert">
            <strong>{loadError.code}</strong> {loadError.message}
          </div>
        ) : null}
        <main key={session ? `s:${session.tenantId}|${session.userId}` : identity ? `${identity.tenantId}|${identity.userId}` : "none"}>{children}</main>
      </div>
    </div>
  );
}
