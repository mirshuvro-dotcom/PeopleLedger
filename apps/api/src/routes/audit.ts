import type { FastifyInstance } from "fastify";
import { verifyAuditChain } from "@peopleledger/platform";
import { tenantRoute, type RouteDeps } from "../tenant-route.js";
import { limit } from "./schemas.js";

export function auditRoutes(app: FastifyInstance, deps: RouteDeps): void {
  // AUD-10 (partial): searchable activity log, newest first, seq cursor.
  tenantRoute(app, deps, {
    method: "GET",
    url: "/v1/audit-events",
    permission: "audit_event:view",
    schema: {
      querystring: {
        type: "object",
        additionalProperties: false,
        properties: {
          before: { type: "integer", minimum: 1 },
          limit,
          category: { type: "string", maxLength: 40 },
          action: { type: "string", maxLength: 100 },
          resourceType: { type: "string", maxLength: 63 },
          resourceId: { type: "string", maxLength: 200 },
          result: { type: "string", enum: ["success", "denied", "failed"] },
          correlationId: { type: "string", maxLength: 200 },
        },
      },
    },
    handler: async ({ tx, req }) => {
      const q = req.query as { before?: number; limit: number; category?: string; action?: string; resourceType?: string; resourceId?: string; result?: string; correlationId?: string };
      const rows = (
        await tx.query<{ seq: string }>(
          `SELECT seq::text, id, occurred_at, recorded_at, category, action, actor_type, actor_id, acting_as_user_id, legal_entity_id,
                  resource_type, resource_id, result, reason, source, host(ip_address) AS ip_address, user_agent, request_id, correlation_id,
                  before_ref, after_ref, prev_hash, hash
           FROM audit_event
           WHERE ($1::bigint IS NULL OR seq < $1)
             AND ($2::text IS NULL OR category = $2) AND ($3::text IS NULL OR action ILIKE $3 || '%')
             AND ($4::text IS NULL OR resource_type = $4) AND ($5::text IS NULL OR resource_id = $5)
             AND ($6::text IS NULL OR result = $6) AND ($7::text IS NULL OR correlation_id = $7)
           ORDER BY audit_event.seq DESC LIMIT $8`,
          [q.before ?? null, q.category ?? null, q.action ?? null, q.resourceType ?? null, q.resourceId ?? null, q.result ?? null, q.correlationId ?? null, q.limit + 1],
        )
      ).rows;
      const page = rows.slice(0, q.limit);
      return { items: page, nextBefore: rows.length > q.limit ? Number(page[page.length - 1]!.seq) : null };
    },
  });

  tenantRoute(app, deps, {
    method: "GET",
    url: "/v1/audit-events/verify",
    permission: "audit_event:view",
    handler: async ({ tx }) => verifyAuditChain(tx),
  });
}
