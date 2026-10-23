"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useIdentity } from "./IdentityProvider";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/requirements", label: "Requirements" },
  { href: "/organization", label: "Organization" },
  { href: "/people", label: "People" },
  { href: "/access", label: "Access & roles" },
  { href: "/audit", label: "Audit log" },
  { href: "/payroll", label: "Payroll calculator" },
];

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { tenants, identity, tenant, user, setIdentity, loadError } = useIdentity();

  return (
    <div className="shell">
      <div className="dev-banner" role="note">
        Developer console · synthetic data only · identity switcher stands in for sign-in (not available in production)
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
          <label className="identity">
            <span className="muted">Acting as</span>
            <select
              aria-label="Acting as tenant and user"
              value={identity ? `${identity.tenantId}|${identity.userId}` : ""}
              onChange={(e) => {
                const [tenantId, userId] = e.target.value.split("|");
                if (tenantId && userId) setIdentity({ tenantId, userId });
              }}
              disabled={tenants.length === 0}
            >
              {tenants.length === 0 ? <option value="">No synthetic users (run pnpm dev:setup)</option> : null}
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
        </header>
        {loadError ? (
          <div className="error" role="alert">
            <strong>{loadError.code}</strong> {loadError.message}
          </div>
        ) : null}
        <main key={identity ? `${identity.tenantId}|${identity.userId}` : "none"}>{children}</main>
      </div>
    </div>
  );
}
