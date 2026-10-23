import { auditDiff, StaleVersionError, writeAudit, type TenantTx } from "@peopleledger/platform";

/**
 * People-owned writes (ARCH-04): person, person_version, employment,
 * employment_version. History is append-only: a change adds a version and
 * closes the previous open one (EMP-08); the anchor's version column provides
 * optimistic locking for the whole aggregate (ARCH-05). Every write audits in
 * the same transaction (AUD-08).
 */

export interface PersonAttributes {
  readonly legalNameEn: string;
  readonly legalNameBn?: string;
  readonly preferredName?: string;
  readonly birthDate?: string;
}

function columns(a: PersonAttributes) {
  return {
    legal_name_en: a.legalNameEn,
    legal_name_bn: a.legalNameBn ?? null,
    preferred_name: a.preferredName ?? null,
    birth_date: a.birthDate ?? null,
  };
}

export async function createPerson(tx: TenantTx, input: PersonAttributes & { effectiveFrom: string }): Promise<{ personId: string; versionId: string }> {
  const p = await tx.query<{ id: string }>("INSERT INTO person DEFAULT VALUES RETURNING id");
  const personId = p.rows[0]!.id;
  const c = columns(input);
  const v = await tx.query<{ id: string }>(
    `INSERT INTO person_version (person_id, effective_from, legal_name_en, legal_name_bn, preferred_name, birth_date)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [personId, input.effectiveFrom, c.legal_name_en, c.legal_name_bn, c.preferred_name, c.birth_date],
  );
  const versionId = v.rows[0]!.id;
  await writeAudit(tx, {
    category: "data-change",
    action: "person.created",
    resourceType: "person",
    resourceId: personId,
    after: { version_id: versionId, effective_from: input.effectiveFrom, ...auditDiff("person_version", null, c).after },
  });
  return { personId, versionId };
}

/**
 * Add a version effective from `effectiveFrom`, closing the version in force
 * the day before. Backdating before the open version's start is a correction
 * workflow and is refused by the database (overlap / closed-history rules).
 */
export async function appendPersonVersion(
  tx: TenantTx,
  input: PersonAttributes & { personId: string; expectedVersion: number; effectiveFrom: string },
): Promise<{ versionId: string; version: number }> {
  const bumped = await tx.query<{ version: number }>(
    "UPDATE person SET version = version + 1 WHERE id = $1 AND version = $2 RETURNING version",
    [input.personId, input.expectedVersion],
  );
  if (bumped.rowCount !== 1) throw new StaleVersionError("person", input.personId);

  const open = await tx.query<{ id: string; legal_name_en: string; legal_name_bn: string | null; preferred_name: string | null; birth_date: string | null }>(
    `SELECT id, legal_name_en, legal_name_bn, preferred_name, birth_date FROM person_version
     WHERE person_id = $1 AND effective_to IS NULL`,
    [input.personId],
  );
  const previous = open.rows[0];
  if (previous) {
    await tx.query("UPDATE person_version SET effective_to = ($1::date - 1) WHERE id = $2", [input.effectiveFrom, previous.id]);
  }
  const c = columns(input);
  const v = await tx.query<{ id: string }>(
    `INSERT INTO person_version (person_id, effective_from, legal_name_en, legal_name_bn, preferred_name, birth_date)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [input.personId, input.effectiveFrom, c.legal_name_en, c.legal_name_bn, c.preferred_name, c.birth_date],
  );
  const versionId = v.rows[0]!.id;
  const { id: _id, ...prevColumns } = previous ?? { id: "" };
  const diff = auditDiff("person_version", previous ? prevColumns : null, c);
  await writeAudit(tx, {
    category: "data-change",
    action: "person.version_added",
    resourceType: "person",
    resourceId: input.personId,
    before: previous ? { version_id: previous.id, ...diff.before } : undefined,
    after: { version_id: versionId, effective_from: input.effectiveFrom, ...diff.after },
  });
  return { versionId, version: bumped.rows[0]!.version };
}

export async function createEmployment(
  tx: TenantTx,
  input: { personId: string; legalEntityId: string; employeeCode: string; hireDate: string; jobTitle: string },
): Promise<{ employmentId: string; versionId: string }> {
  const e = await tx.query<{ id: string }>(
    "INSERT INTO employment (person_id, legal_entity_id, employee_code, hire_date) VALUES ($1, $2, $3, $4) RETURNING id",
    [input.personId, input.legalEntityId, input.employeeCode, input.hireDate],
  );
  const employmentId = e.rows[0]!.id;
  const v = await tx.query<{ id: string }>(
    "INSERT INTO employment_version (employment_id, effective_from, job_title) VALUES ($1, $2, $3) RETURNING id",
    [employmentId, input.hireDate, input.jobTitle],
  );
  const versionId = v.rows[0]!.id;
  await writeAudit(tx, {
    category: "data-change",
    action: "employment.created",
    resourceType: "employment",
    resourceId: employmentId,
    legalEntityId: input.legalEntityId,
    after: {
      version_id: versionId,
      ...auditDiff("employment", null, { person_id: input.personId, legal_entity_id: input.legalEntityId, employee_code: input.employeeCode, hire_date: input.hireDate }).after,
      ...auditDiff("employment_version", null, { job_title: input.jobTitle }).after,
    },
  });
  return { employmentId, versionId };
}
