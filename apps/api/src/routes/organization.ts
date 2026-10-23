import type { FastifyInstance } from "fastify";
import { createLegalEntity } from "@peopleledger/platform";
import { tenantRoute, type RouteDeps } from "../tenant-route.js";
import { body, text } from "./schemas.js";

export function organizationRoutes(app: FastifyInstance, deps: RouteDeps): void {
  tenantRoute(app, deps, {
    method: "GET",
    url: "/v1/tenant",
    permission: "tenant:view",
    handler: async ({ tx }) => (await tx.query("SELECT id, name, environment, status, created_at FROM tenant")).rows[0],
  });

  tenantRoute(app, deps, {
    method: "GET",
    url: "/v1/legal-entities",
    permission: "legal_entity:view",
    handler: async ({ tx }) => ({
      items: (await tx.query(
        "SELECT id, legal_name_en, legal_name_bn, status, production_payroll_enabled, version, created_at FROM legal_entity ORDER BY legal_name_en LIMIT 500",
      )).rows,
    }),
  });

  tenantRoute(app, deps, {
    method: "POST",
    url: "/v1/legal-entities",
    permission: "legal_entity:create",
    successStatus: 201,
    schema: { body: body(["legalNameEn"], { legalNameEn: text(300), legalNameBn: text(300) }) },
    handler: async ({ tx, req }) => {
      const b = req.body as { legalNameEn: string; legalNameBn?: string };
      return { id: await createLegalEntity(tx, { legalNameEn: b.legalNameEn, ...(b.legalNameBn ? { legalNameBn: b.legalNameBn } : {}) }) };
    },
  });
}
