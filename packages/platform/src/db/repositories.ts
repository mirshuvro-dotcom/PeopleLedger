import type pg from "pg";
import { auditDiff, writeAudit } from "./audit.js";
import { withPlatform, type PlatformContext, type TenantTx } from "./context.js";
import { createHash, randomBytes } from "node:crypto";
import { DbRuleError, StaleVersionError } from "./errors.js";

/**
 * Platform-owned writes (ARCH-04): tenant, legal_entity, membership, role,
 * role_permission, role_assignment. Every write audits in the same
 * transaction. Authorization (who may call these) belongs to the API layer
 * through `requirePermission`; it is not built yet.
 */

export async function provisionTenant(platformPool: pg.Pool, ctx: PlatformContext, input: { name: string; environment: "production" | "sandbox" }): Promise<string> {
  return withPlatform(platformPool, ctx, async (tx) => {
    const r = await tx.query<{ id: string }>("SELECT provision_tenant($1, $2) AS id", [input.name, input.environment]);
    return r.rows[0]!.id;
  });
}

export async function createLegalEntity(tx: TenantTx, input: { legalNameEn: string; legalNameBn?: string }): Promise<string> {
  const r = await tx.query<{ id: string }>("INSERT INTO legal_entity (legal_name_en, legal_name_bn) VALUES ($1, $2) RETURNING id", [
    input.legalNameEn,
    input.legalNameBn ?? null,
  ]);
  const id = r.rows[0]!.id;
  const diff = auditDiff("legal_entity", null, { legal_name_en: input.legalNameEn, legal_name_bn: input.legalNameBn ?? null });
  await writeAudit(tx, { category: "configuration", action: "legal_entity.created", resourceType: "legal_entity", resourceId: id, legalEntityId: id, after: diff.after });
  return id;
}

export async function inviteMember(tx: TenantTx, email: string): Promise<{ membershipId: string; userId: string }> {
  const r = await tx.query<{ id: string }>("SELECT membership_invite($1) AS id", [email]);
  const membershipId = r.rows[0]!.id;
  const m = await tx.query<{ user_id: string }>("SELECT user_id FROM membership WHERE id = $1", [membershipId]);
  const userId = m.rows[0]!.user_id;
  await writeAudit(tx, { category: "security", action: "membership.invited", resourceType: "membership", resourceId: membershipId, after: { user_id: userId, status: "invited" } });
  return { membershipId, userId };
}

export type MembershipStatus = "invited" | "active" | "suspended" | "revoked";

export async function changeMembershipStatus(
  tx: TenantTx,
  input: { membershipId: string; expectedVersion: number; status: MembershipStatus; reason: string },
): Promise<number> {
  const before = await tx.query<{ status: string }>("SELECT status FROM membership WHERE id = $1", [input.membershipId]);
  const r = await tx.query<{ version: number }>(
    "UPDATE membership SET status = $1, version = version + 1 WHERE id = $2 AND version = $3 RETURNING version",
    [input.status, input.membershipId, input.expectedVersion],
  );
  if (r.rowCount !== 1) throw new StaleVersionError("membership", input.membershipId);
  // RBAC-17: losing access ends the user's sessions in this tenant at once.
  let sessionsRevoked = 0;
  if (input.status === "suspended" || input.status === "revoked") {
    const m = await tx.query<{ user_id: string }>("SELECT user_id FROM membership WHERE id = $1", [input.membershipId]);
    const s = await tx.query<{ n: number }>("SELECT auth_revoke_member_sessions($1, $2) AS n", [m.rows[0]!.user_id, `membership ${input.status}`]);
    sessionsRevoked = s.rows[0]?.n ?? 0;
  }
  await writeAudit(tx, {
    category: "security",
    action: "membership.status_changed",
    resourceType: "membership",
    resourceId: input.membershipId,
    reason: input.reason,
    before: { status: before.rows[0]?.status ?? null },
    after: { status: input.status, sessionsRevoked },
  });
  return r.rows[0]!.version;
}

/**
 * One-time access link for a member (IAM-01 account recovery / invitation
 * acceptance): `initial-password` for an invited member, `password-reset` for an
 * active one. Returns the raw token once; only its hash is stored. Delivered by
 * the administrator until email exists (COM-01).
 */
export async function issueAccessLink(tx: TenantTx, membershipId: string, ttlHours = 72): Promise<{ token: string; purpose: string; expiresAt: Date }> {
  const m = await tx.query<{ status: string }>("SELECT status FROM membership WHERE id = $1", [membershipId]);
  const status = m.rows[0]?.status;
  if (status !== "invited" && status !== "active") throw new DbRuleError("REFERENCE_NOT_FOUND", "Membership not found or not eligible for an access link.");
  const purpose = status === "invited" ? "initial-password" : "password-reset";
  const token = randomBytes(32).toString("base64url");
  const r = await tx.query<{ expires: Date }>("SELECT auth_issue_setup_token($1, $2, $3, $4) AS expires", [
    membershipId,
    createHash("sha256").update(token).digest("hex"),
    purpose,
    ttlHours,
  ]);
  await writeAudit(tx, { category: "security", action: "membership.access_link_issued", resourceType: "membership", resourceId: membershipId, after: { purpose, expiresAt: r.rows[0]!.expires } });
  return { token, purpose, expiresAt: r.rows[0]!.expires };
}

export async function createRole(tx: TenantTx, input: { name: string; description?: string; permissions: readonly string[] }): Promise<string> {
  const r = await tx.query<{ id: string }>("INSERT INTO role (name, description) VALUES ($1, $2) RETURNING id", [input.name, input.description ?? null]);
  const id = r.rows[0]!.id;
  for (const code of input.permissions) {
    await tx.query("INSERT INTO role_permission (role_id, permission_code) VALUES ($1, $2)", [id, code]);
  }
  await writeAudit(tx, { category: "security", action: "role.created", resourceType: "role", resourceId: id, after: { name: input.name, permissions: [...input.permissions].sort() } });
  return id;
}

export interface RoleAssignmentInput {
  readonly membershipId: string;
  readonly roleId: string;
  readonly scope: { readonly type: "tenant" } | { readonly type: "legal_entity"; readonly legalEntityId: string };
  readonly effectiveFrom: string;
  readonly effectiveTo?: string;
  readonly reason: string;
}

export async function assignRole(tx: TenantTx, input: RoleAssignmentInput): Promise<string> {
  const scopeEntity = input.scope.type === "legal_entity" ? input.scope.legalEntityId : null;
  const r = await tx.query<{ id: string }>(
    `INSERT INTO role_assignment (membership_id, role_id, scope_type, scope_legal_entity_id, effective_from, effective_to, reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [input.membershipId, input.roleId, input.scope.type, scopeEntity, input.effectiveFrom, input.effectiveTo ?? null, input.reason],
  );
  const id = r.rows[0]!.id;
  await writeAudit(tx, {
    category: "security",
    action: "role_assignment.created",
    resourceType: "role_assignment",
    resourceId: id,
    reason: input.reason,
    ...(scopeEntity ? { legalEntityId: scopeEntity } : {}),
    after: auditDiff("role_assignment", null, {
      membership_id: input.membershipId,
      role_id: input.roleId,
      scope_type: input.scope.type,
      scope_legal_entity_id: scopeEntity,
      effective_from: input.effectiveFrom,
      effective_to: input.effectiveTo ?? null,
    }).after,
  });
  return id;
}

export async function endRoleAssignment(tx: TenantTx, input: { id: string; expectedVersion: number; effectiveTo: string; reason: string }): Promise<number> {
  const r = await tx.query<{ version: number }>(
    "UPDATE role_assignment SET effective_to = $1, version = version + 1 WHERE id = $2 AND version = $3 RETURNING version",
    [input.effectiveTo, input.id, input.expectedVersion],
  );
  if (r.rowCount !== 1) throw new StaleVersionError("role_assignment", input.id);
  await writeAudit(tx, { category: "security", action: "role_assignment.ended", resourceType: "role_assignment", resourceId: input.id, reason: input.reason, after: { effective_to: { changed: true } } });
  return r.rows[0]!.version;
}
