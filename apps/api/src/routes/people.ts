import type { FastifyInstance } from "fastify";
import { appendPersonVersion, createEmployment, createPerson } from "@peopleledger/people";
import { notFound } from "../errors.js";
import { tenantRoute, type RouteDeps } from "../tenant-route.js";
import { body, idParams, isoDate, limit, text, uuid } from "./schemas.js";

const personAttributes = {
  legalNameEn: text(300),
  legalNameBn: text(300),
  preferredName: text(300),
  birthDate: isoDate,
  effectiveFrom: isoDate,
};

type PersonBody = { legalNameEn: string; legalNameBn?: string; preferredName?: string; birthDate?: string; effectiveFrom: string };

function attrs(b: PersonBody) {
  return {
    legalNameEn: b.legalNameEn,
    effectiveFrom: b.effectiveFrom,
    ...(b.legalNameBn ? { legalNameBn: b.legalNameBn } : {}),
    ...(b.preferredName ? { preferredName: b.preferredName } : {}),
    ...(b.birthDate ? { birthDate: b.birthDate } : {}),
  };
}

/** The version in force on asOf, else the latest one. */
const CURRENT_VERSION = `
  JOIN LATERAL (
    SELECT v.* FROM person_version v WHERE v.person_id = p.id
    ORDER BY (v.effective_from <= $1::date AND (v.effective_to IS NULL OR v.effective_to >= $1::date)) DESC, v.effective_from DESC
    LIMIT 1
  ) cv ON true`;

export function peopleRoutes(app: FastifyInstance, deps: RouteDeps): void {
  tenantRoute(app, deps, {
    method: "GET",
    url: "/v1/people",
    permission: "person:view",
    schema: {
      querystring: {
        type: "object",
        additionalProperties: false,
        properties: { cursor: uuid, limit, q: { type: "string", minLength: 1, maxLength: 100 } },
      },
    },
    handler: async ({ tx, req, asOf }) => {
      const q = req.query as { cursor?: string; limit: number; q?: string };
      const rows = (
        await tx.query<{ id: string }>(
          `SELECT p.id, p.version, cv.legal_name_en, cv.legal_name_bn, cv.preferred_name, cv.effective_from AS current_since,
                  (SELECT count(*)::int FROM employment e WHERE e.person_id = p.id) AS employments
           FROM person p ${CURRENT_VERSION}
           WHERE ($2::uuid IS NULL OR p.id > $2::uuid)
             AND ($3::text IS NULL OR cv.legal_name_en ILIKE '%' || $3 || '%' OR cv.legal_name_bn ILIKE '%' || $3 || '%')
           ORDER BY p.id LIMIT $4`,
          [asOf, q.cursor ?? null, q.q ?? null, q.limit + 1],
        )
      ).rows;
      const page = rows.slice(0, q.limit);
      return { items: page, nextCursor: rows.length > q.limit ? page[page.length - 1]!.id : null };
    },
  });

  tenantRoute(app, deps, {
    method: "GET",
    url: "/v1/people/:id",
    permission: "person:view",
    schema: { params: idParams },
    handler: async ({ tx, req, userId, asOf }) => {
      const { id } = req.params as { id: string };
      const person = await tx.query("SELECT id, version, created_at, created_by FROM person WHERE id = $1", [id]);
      if (person.rowCount === 0) throw notFound();
      // Field-level permissions (RBAC-04) are later work; birth date is shown to person:view holders for now.
      const versions = await tx.query(
        `SELECT id, effective_from, effective_to, legal_name_en, legal_name_bn, preferred_name, birth_date, recorded_at, recorded_by
         FROM person_version WHERE person_id = $1 ORDER BY effective_from`,
        [id],
      );
      const employments = await tx.query(
        `SELECT e.id, e.legal_entity_id, le.legal_name_en AS legal_entity_name, e.employee_code, e.hire_date, e.end_date, e.version,
                (SELECT json_agg(json_build_object('id', ev.id, 'effectiveFrom', ev.effective_from, 'effectiveTo', ev.effective_to, 'jobTitle', ev.job_title, 'recordedAt', ev.recorded_at) ORDER BY ev.effective_from)
                 FROM employment_version ev WHERE ev.employment_id = e.id) AS versions
         FROM employment e JOIN legal_entity le ON le.id = e.legal_entity_id
         WHERE e.person_id = $1 AND app_has_permission($2, 'employment:view', e.legal_entity_id, $3::date)
         ORDER BY e.hire_date`,
        [id, userId, asOf],
      );
      return { ...person.rows[0], versions: versions.rows, employments: employments.rows };
    },
  });

  tenantRoute(app, deps, {
    method: "POST",
    url: "/v1/people",
    permission: "person:create",
    successStatus: 201,
    schema: { body: body(["legalNameEn", "effectiveFrom"], personAttributes) },
    handler: async ({ tx, req }) => createPerson(tx, attrs(req.body as PersonBody)),
  });

  tenantRoute(app, deps, {
    method: "POST",
    url: "/v1/people/:id/versions",
    permission: "person:edit",
    successStatus: 201,
    schema: { params: idParams, body: body(["legalNameEn", "effectiveFrom", "expectedVersion"], { ...personAttributes, expectedVersion: { type: "integer", minimum: 1 } }) },
    handler: async ({ tx, req }) => {
      const { id } = req.params as { id: string };
      const exists = await tx.query("SELECT 1 FROM person WHERE id = $1", [id]);
      if (exists.rowCount === 0) throw notFound();
      const b = req.body as PersonBody & { expectedVersion: number };
      return appendPersonVersion(tx, { personId: id, expectedVersion: b.expectedVersion, ...attrs(b) });
    },
  });

  tenantRoute(app, deps, {
    method: "GET",
    url: "/v1/employments",
    permission: "employment:view",
    scope: { kind: "row-filtered" },
    schema: { querystring: { type: "object", additionalProperties: false, properties: { cursor: uuid, limit, legalEntityId: uuid } } },
    handler: async ({ tx, req, userId, asOf }) => {
      const q = req.query as { cursor?: string; limit: number; legalEntityId?: string };
      const rows = (
        await tx.query<{ id: string }>(
          `SELECT e.id, e.person_id, cv.legal_name_en AS person_name, e.legal_entity_id, le.legal_name_en AS legal_entity_name,
                  e.employee_code, e.hire_date, e.end_date,
                  (SELECT ev.job_title FROM employment_version ev WHERE ev.employment_id = e.id ORDER BY ev.effective_from DESC LIMIT 1) AS job_title
           FROM employment e
           JOIN person p ON p.id = e.person_id ${CURRENT_VERSION}
           JOIN legal_entity le ON le.id = e.legal_entity_id
           WHERE app_has_permission($2, 'employment:view', e.legal_entity_id, $1::date)
             AND ($3::uuid IS NULL OR e.id > $3::uuid)
             AND ($4::uuid IS NULL OR e.legal_entity_id = $4::uuid)
           ORDER BY e.id LIMIT $5`,
          [asOf, userId, q.cursor ?? null, q.legalEntityId ?? null, q.limit + 1],
        )
      ).rows;
      const page = rows.slice(0, q.limit);
      return { items: page, nextCursor: rows.length > q.limit ? page[page.length - 1]!.id : null };
    },
  });

  tenantRoute(app, deps, {
    method: "POST",
    url: "/v1/employments",
    permission: "employment:create",
    scope: { kind: "entity", legalEntityId: (req) => (req.body as { legalEntityId?: string } | undefined)?.legalEntityId },
    successStatus: 201,
    schema: {
      body: body(["personId", "legalEntityId", "employeeCode", "hireDate", "jobTitle"], {
        personId: uuid,
        legalEntityId: uuid,
        employeeCode: { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9._/-]{0,39}$" },
        hireDate: isoDate,
        jobTitle: text(200),
      }),
    },
    handler: async ({ tx, req }) => createEmployment(tx, req.body as Parameters<typeof createEmployment>[1]),
  });
}
