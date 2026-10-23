import { DbRuleError } from "./errors.js";
import type { TenantTx } from "./context.js";

/**
 * NFR-11: business dates are Asia/Dhaka calendar dates. Used as the default
 * "as of" date for effective-dated authorization.
 */
export function businessDateInDhaka(instant: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}

export interface PermissionQuery {
  readonly userId: string;
  readonly permission: string;
  /** Required for entity-scoped resources; tenant-wide grants also satisfy it. */
  readonly legalEntityId?: string;
  readonly asOf: string;
}

/**
 * SEC-01 deny-by-default decision for the current tenant: true only when an
 * active membership holds an in-force role assignment whose role carries the
 * permission and whose scope covers the target.
 */
export async function hasPermission(tx: TenantTx, q: PermissionQuery): Promise<boolean> {
  const r = await tx.query<{ allowed: boolean }>("SELECT app_has_permission($1, $2, $3, $4::date) AS allowed", [
    q.userId,
    q.permission,
    q.legalEntityId ?? null,
    q.asOf,
  ]);
  return r.rows[0]?.allowed === true;
}

export async function requirePermission(tx: TenantTx, q: PermissionQuery): Promise<void> {
  if (!(await hasPermission(tx, q))) {
    throw new DbRuleError("PERMISSION_DENIED", `Permission ${q.permission} is not granted.`);
  }
}
