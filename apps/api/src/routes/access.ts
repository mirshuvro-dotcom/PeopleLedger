import type { FastifyInstance } from "fastify";
import { assignRole, changeMembershipStatus, createRole, endRoleAssignment, hasPermission, inviteMember, issueAccessLink } from "@peopleledger/platform";
import { tenantRoute, type RouteDeps } from "../tenant-route.js";
import { body, idParams, isoDate, text, uuid } from "./schemas.js";

export function accessRoutes(app: FastifyInstance, deps: RouteDeps): void {
  tenantRoute(app, deps, {
    method: "GET",
    url: "/v1/me",
    permission: { membershipOnly: true },
    handler: async ({ tx, userId, asOf }) => {
      const me = await tx.query(
        "SELECT m.id AS membership_id, m.status, u.id AS user_id, u.email FROM membership m JOIN user_account u ON u.id = m.user_id WHERE m.user_id = $1",
        [userId],
      );
      const perms = await tx.query<{ code: string; tenant_wide: boolean; entities: string[] }>(
        `SELECT p.code,
                app_has_permission($1, p.code, NULL, $2::date) AS tenant_wide,
                coalesce(array_agg(le.id) FILTER (WHERE app_has_permission($1, p.code, le.id, $2::date)), '{}') AS entities
         FROM permission p LEFT JOIN legal_entity le ON true
         GROUP BY p.code ORDER BY p.code`,
        [userId, asOf],
      );
      return {
        ...me.rows[0],
        asOf,
        permissions: perms.rows.filter((p) => p.tenant_wide || p.entities.length > 0),
      };
    },
  });

  tenantRoute(app, deps, {
    method: "GET",
    url: "/v1/members",
    permission: "membership:view",
    handler: async ({ tx }) => ({
      items: (await tx.query(
        `SELECT m.id, m.user_id, u.email, m.status, m.version, m.created_at
         FROM membership m JOIN user_account u ON u.id = m.user_id ORDER BY u.email LIMIT 500`,
      )).rows,
    }),
  });

  tenantRoute(app, deps, {
    method: "POST",
    url: "/v1/members",
    permission: "membership:create",
    successStatus: 201,
    schema: { body: body(["email"], { email: { type: "string", format: "email", maxLength: 320 } }) },
    handler: async ({ tx, req }) => inviteMember(tx, (req.body as { email: string }).email),
  });

  tenantRoute(app, deps, {
    method: "POST",
    url: "/v1/members/:id/status",
    permission: "membership:edit",
    schema: {
      params: idParams,
      body: body(["status", "expectedVersion", "reason"], {
        status: { type: "string", enum: ["active", "suspended", "revoked"] },
        expectedVersion: { type: "integer", minimum: 1 },
        reason: text(1000),
      }),
    },
    handler: async ({ tx, req }) => {
      const { id } = req.params as { id: string };
      const b = req.body as { status: "active" | "suspended" | "revoked"; expectedVersion: number; reason: string };
      return { version: await changeMembershipStatus(tx, { membershipId: id, ...b }) };
    },
  });

  // IAM-01: one-time link to set (invited) or reset (active) a password. Shown once; email delivery is COM-01.
  tenantRoute(app, deps, {
    method: "POST",
    url: "/v1/members/:id/access-link",
    permission: "membership:create",
    successStatus: 201,
    schema: { params: idParams },
    handler: async ({ tx, req }) => {
      const link = await issueAccessLink(tx, (req.params as { id: string }).id);
      return { path: `/setup?token=${encodeURIComponent(link.token)}`, purpose: link.purpose, expiresAt: link.expiresAt };
    },
  });

  tenantRoute(app, deps, {
    method: "GET",
    url: "/v1/permissions",
    permission: "role:view",
    handler: async ({ tx }) => ({
      items: (await tx.query("SELECT code, resource, action, description, owner_module, sensitivity FROM permission ORDER BY code")).rows,
    }),
  });

  tenantRoute(app, deps, {
    method: "GET",
    url: "/v1/roles",
    permission: "role:view",
    handler: async ({ tx }) => ({
      items: (await tx.query(
        `SELECT r.id, r.name, r.description, r.is_system, r.version,
                coalesce(array_agg(rp.permission_code ORDER BY rp.permission_code) FILTER (WHERE rp.permission_code IS NOT NULL), '{}') AS permissions
         FROM role r LEFT JOIN role_permission rp ON rp.role_id = r.id
         GROUP BY r.tenant_id, r.id ORDER BY r.name`,
      )).rows,
    }),
  });

  tenantRoute(app, deps, {
    method: "POST",
    url: "/v1/roles",
    permission: "role:create",
    successStatus: 201,
    schema: {
      body: body(["name", "permissions"], {
        name: text(120),
        description: text(1000),
        permissions: { type: "array", maxItems: 200, uniqueItems: true, items: { type: "string", pattern: "^[a-z_]+:[a-z_]+$" } },
      }),
    },
    handler: async ({ tx, req }) => {
      const b = req.body as { name: string; description?: string; permissions: string[] };
      return { id: await createRole(tx, { name: b.name, permissions: b.permissions, ...(b.description ? { description: b.description } : {}) }) };
    },
  });

  tenantRoute(app, deps, {
    method: "GET",
    url: "/v1/role-assignments",
    permission: "role_assignment:view",
    handler: async ({ tx, asOf }) => ({
      items: (await tx.query(
        `SELECT ra.id, ra.membership_id, u.email, ra.role_id, r.name AS role_name, ra.scope_type, ra.scope_legal_entity_id,
                le.legal_name_en AS scope_legal_entity_name, ra.effective_from, ra.effective_to, ra.reason, ra.recorded_at, ra.recorded_by, ra.version,
                (ra.effective_from <= $1::date AND (ra.effective_to IS NULL OR ra.effective_to >= $1::date)) AS in_force
         FROM role_assignment ra
         JOIN membership m ON m.id = ra.membership_id
         JOIN user_account u ON u.id = m.user_id
         JOIN role r ON r.id = ra.role_id
         LEFT JOIN legal_entity le ON le.id = ra.scope_legal_entity_id
         ORDER BY u.email, r.name, ra.effective_from LIMIT 1000`,
        [asOf],
      )).rows,
    }),
  });

  tenantRoute(app, deps, {
    method: "POST",
    url: "/v1/role-assignments",
    permission: "role_assignment:create",
    successStatus: 201,
    schema: {
      body: body(["membershipId", "roleId", "scope", "effectiveFrom", "reason"], {
        membershipId: uuid,
        roleId: uuid,
        scope: {
          type: "object",
          required: ["type"],
          additionalProperties: false,
          properties: { type: { type: "string", enum: ["tenant", "legal_entity"] }, legalEntityId: uuid },
        },
        effectiveFrom: isoDate,
        effectiveTo: isoDate,
        reason: text(1000),
      }),
    },
    handler: async ({ tx, req }) => {
      const b = req.body as {
        membershipId: string;
        roleId: string;
        scope: { type: "tenant" | "legal_entity"; legalEntityId?: string };
        effectiveFrom: string;
        effectiveTo?: string;
        reason: string;
      };
      const scope = b.scope.type === "legal_entity" ? { type: "legal_entity" as const, legalEntityId: b.scope.legalEntityId ?? "" } : { type: "tenant" as const };
      return {
        id: await assignRole(tx, { membershipId: b.membershipId, roleId: b.roleId, scope, effectiveFrom: b.effectiveFrom, reason: b.reason, ...(b.effectiveTo ? { effectiveTo: b.effectiveTo } : {}) }),
      };
    },
  });

  tenantRoute(app, deps, {
    method: "POST",
    url: "/v1/role-assignments/:id/end",
    permission: "role_assignment:edit",
    schema: { params: idParams, body: body(["expectedVersion", "effectiveTo", "reason"], { expectedVersion: { type: "integer", minimum: 1 }, effectiveTo: isoDate, reason: text(1000) }) },
    handler: async ({ tx, req }) => {
      const { id } = req.params as { id: string };
      const b = req.body as { expectedVersion: number; effectiveTo: string; reason: string };
      return { version: await endRoleAssignment(tx, { id, ...b }) };
    },
  });

  // RBAC-05 (partial): "why can this user do X?"
  tenantRoute(app, deps, {
    method: "GET",
    url: "/v1/permission-check",
    permission: "role_assignment:view",
    schema: {
      querystring: {
        type: "object",
        required: ["userId", "permission"],
        additionalProperties: false,
        properties: { userId: uuid, permission: { type: "string", pattern: "^[a-z_]+:[a-z_]+$" }, legalEntityId: uuid, asOf: isoDate },
      },
    },
    handler: async ({ tx, req, asOf: today }) => {
      const q = req.query as { userId: string; permission: string; legalEntityId?: string; asOf?: string };
      const asOf = q.asOf ?? today;
      const allowed = await hasPermission(tx, { userId: q.userId, permission: q.permission, asOf, ...(q.legalEntityId ? { legalEntityId: q.legalEntityId } : {}) });
      const grants = await tx.query(
        `SELECT r.name AS role_name, ra.scope_type, le.legal_name_en AS scope_legal_entity_name, ra.effective_from, ra.effective_to, m.status AS membership_status,
                (ra.effective_from <= $3::date AND (ra.effective_to IS NULL OR ra.effective_to >= $3::date)) AS in_force
         FROM membership m
         JOIN role_assignment ra ON ra.membership_id = m.id
         JOIN role r ON r.id = ra.role_id
         JOIN role_permission rp ON rp.role_id = r.id AND rp.permission_code = $2
         LEFT JOIN legal_entity le ON le.id = ra.scope_legal_entity_id
         WHERE m.user_id = $1 ORDER BY ra.effective_from`,
        [q.userId, q.permission, asOf],
      );
      return { allowed, asOf, grants: grants.rows };
    },
  });
}
