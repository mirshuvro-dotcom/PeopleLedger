import { isRestricted } from "./classification.js";
import type { TenantTx } from "./context.js";

export type AuditCategory = "security" | "data-change" | "financial" | "privacy" | "configuration" | "communication" | "integration" | "system";
export type AuditResult = "success" | "denied" | "failed";

export interface AuditInput {
  readonly category: AuditCategory;
  /** Dotted action name, e.g. `person.created`. */
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string | null;
  readonly result?: AuditResult;
  readonly reason?: string;
  readonly legalEntityId?: string;
  readonly before?: unknown;
  readonly after?: unknown;
  /** Event time; defaults to now. The database adds its own recorded_at (AUD-09). */
  readonly occurredAt?: Date;
}

export interface AuditReceipt {
  readonly id: string;
  readonly seq: string;
  readonly hash: string;
}

/**
 * Append an audit event inside the caller's transaction (AUD-01, AUD-02,
 * AUD-08). Actor, source and correlation come from the request context. If
 * this insert fails, the caller's transaction fails with it; and sensitive
 * tables refuse to commit without a matching audit row.
 */
export async function writeAudit(tx: TenantTx, input: AuditInput): Promise<AuditReceipt> {
  const c = tx.ctx;
  const result = await tx.query<AuditReceipt>(
    `INSERT INTO audit_event (occurred_at, category, action, actor_type, actor_id, acting_as_user_id, legal_entity_id,
       resource_type, resource_id, result, reason, source, ip_address, user_agent, request_id, correlation_id, before_ref, after_ref)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
     RETURNING id, seq::text AS seq, hash`,
    [
      input.occurredAt ?? new Date(),
      input.category,
      input.action,
      c.actor.type,
      c.actor.id,
      c.actingAsUserId ?? null,
      input.legalEntityId ?? null,
      input.resourceType,
      input.resourceId,
      input.result ?? "success",
      input.reason ?? null,
      c.source,
      c.ipAddress ?? null,
      c.userAgent ?? null,
      c.requestId ?? null,
      c.correlationId,
      input.before === undefined ? null : JSON.stringify(input.before),
      input.after === undefined ? null : JSON.stringify(input.after),
    ],
  );
  return result.rows[0]!;
}

export interface AuditDiff {
  readonly before: Record<string, unknown> | null;
  readonly after: Record<string, unknown>;
}

/**
 * Field-level diff for audit (AUD-01, AUD-03). Restricted fields (per the
 * data contract) are recorded only as `{ "changed": true, "class": ... }`;
 * their values stay in the versioned source tables, which the audit row points
 * to through resource ids. Hashing low-entropy values such as birth dates would
 * be reversible, so no hash of the value is stored either.
 */
export function auditDiff(table: string, before: Readonly<Record<string, unknown>> | null, after: Readonly<Record<string, unknown>>): AuditDiff {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after)]);
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const key of keys) {
    const from = before?.[key];
    const to = after[key];
    if (before && JSON.stringify(from) === JSON.stringify(to)) continue;
    if (isRestricted(table, key)) {
      if (before) b[key] = { changed: true };
      a[key] = { changed: true };
    } else {
      if (before) b[key] = from ?? null;
      a[key] = to ?? null;
    }
  }
  return { before: before ? b : null, after: a };
}

export interface ChainVerification {
  readonly ok: boolean;
  readonly checked: number;
  readonly firstBadSeq: number | null;
  readonly problem: string | null;
}

/** AUD-06 integrity check of the current tenant's chain. */
export async function verifyAuditChain(tx: TenantTx): Promise<ChainVerification> {
  const r = await tx.query<{ ok: boolean; checked: string; first_bad_seq: string | null; problem: string | null }>(
    "SELECT ok, checked::text, first_bad_seq::text, problem FROM audit_verify_chain($1)",
    [tx.ctx.tenantId],
  );
  const row = r.rows[0]!;
  return {
    ok: row.ok,
    checked: Number(row.checked),
    firstBadSeq: row.first_bad_seq === null ? null : Number(row.first_bad_seq),
    problem: row.problem,
  };
}
