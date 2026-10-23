import { randomUUID } from "node:crypto";
import pg from "pg";
import {
  createLegalEntity,
  createPool,
  inviteMember,
  migrateUp,
  provisionTenant,
  withTenant,
  type PlatformContext,
  type RequestContext,
} from "../../src/index.js";
import { ADMIN_URL, LOGINS, urlFor } from "./env.js";

export interface TestDb {
  readonly name: string;
  /** Superuser connection to the test database: setup and tamper simulation only. */
  readonly admin: pg.Client;
  readonly app: pg.Pool;
  readonly worker: pg.Pool;
  readonly platform: pg.Pool;
  readonly auth: pg.Pool;
  close(): Promise<void>;
}

export async function createDatabase(options: { migrate?: boolean; appPoolSize?: number } = {}): Promise<TestDb> {
  const name = `pl_test_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const server = new pg.Client({ connectionString: ADMIN_URL });
  await server.connect();
  await server.query(`CREATE DATABASE ${name}`);
  await server.end();

  const admin = new pg.Client({ connectionString: urlFor(name) });
  await admin.connect();
  if (options.migrate !== false) await migrateUp(admin);

  const pool = (login: string, max: number) => createPool(urlFor(name, login), { environment: "test", applicationName: `test-${login}`, max });
  const db: TestDb = {
    name,
    admin,
    app: pool(LOGINS.app, options.appPoolSize ?? 5),
    worker: pool(LOGINS.worker, 5),
    platform: pool(LOGINS.platform, 2),
    auth: pool(LOGINS.auth, 5),
    async close() {
      await Promise.all([db.app.end(), db.worker.end(), db.platform.end(), db.auth.end()]);
      await admin.end();
      const s = new pg.Client({ connectionString: ADMIN_URL });
      await s.connect();
      await s.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await s.end();
    },
  };
  return db;
}

export const platformCtx: PlatformContext = {
  actor: { type: "platform-operator", id: "platform:synthetic-operator" },
  correlationId: "test-platform",
};

/** A user actor in a tenant. `userId` defaults to a random id with no membership. */
export function userCtx(tenantId: string, userId: string = randomUUID()): RequestContext {
  return { tenantId, actor: { type: "user", id: `user:${userId}`, userId }, correlationId: `test-${randomUUID()}`, source: "api", ipAddress: "192.0.2.10", userAgent: "vitest" };
}

export interface SeededTenant {
  readonly tenantId: string;
  readonly legalEntityId: string;
  readonly membershipId: string;
  readonly userId: string;
}

/** Provision a tenant with one legal entity and one invited member (synthetic). */
export async function seedTenant(db: TestDb, label: string): Promise<SeededTenant> {
  const tenantId = await provisionTenant(db.platform, platformCtx, { name: `Synthetic ${label}`, environment: "sandbox" });
  return withTenant(db.app, userCtx(tenantId), async (tx) => {
    const legalEntityId = await createLegalEntity(tx, { legalNameEn: `Synthetic ${label} Ltd` });
    const { membershipId, userId } = await inviteMember(tx, `member.${label.toLowerCase()}@example.test`);
    return { tenantId, legalEntityId, membershipId, userId };
  });
}

/** Expect a promise to reject with an error whose `code` (DbRuleError or pg SQLSTATE) matches. */
export async function rejectsWithCode(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    const actual = (error as { code?: string }).code;
    if (actual !== code) throw new Error(`Expected error code ${code}, got ${actual}: ${(error as Error).message}`);
    return;
  }
  throw new Error(`Expected rejection with code ${code}, but the promise resolved`);
}

export interface FullTenant extends SeededTenant {
  readonly roleId: string;
  readonly roleAssignmentId: string;
  readonly personId: string;
  readonly employmentId: string;
  readonly outboxEventId: string;
}

/**
 * Seed one row in every runtime tenant table, through the real repositories.
 * Person/employment writes live in @peopleledger/people; the caller passes
 * them in to keep the platform tests free of a people dependency.
 */
export async function seedFullTenant(
  db: TestDb,
  label: string,
  people: {
    createPerson: (tx: import("../../src/index.js").TenantTx, input: { legalNameEn: string; effectiveFrom: string; birthDate?: string }) => Promise<{ personId: string }>;
    createEmployment: (
      tx: import("../../src/index.js").TenantTx,
      input: { personId: string; legalEntityId: string; employeeCode: string; hireDate: string; jobTitle: string },
    ) => Promise<{ employmentId: string }>;
  },
): Promise<FullTenant> {
  const base = await seedTenant(db, label);
  const { createRole, assignRole, publishEvent, runIdempotent } = await import("../../src/index.js");
  return withTenant(db.app, userCtx(base.tenantId), async (tx) => {
    const roleId = await createRole(tx, { name: `HR ${label}`, permissions: ["person:view", "employment:view"] });
    const roleAssignmentId = await assignRole(tx, {
      membershipId: base.membershipId,
      roleId,
      scope: { type: "legal_entity", legalEntityId: base.legalEntityId },
      effectiveFrom: "2026-07-01",
      reason: "synthetic seed",
    });
    const { personId } = await people.createPerson(tx, { legalNameEn: `Person ${label}`, effectiveFrom: "2026-07-01", birthDate: "1990-01-15" });
    const { employmentId } = await people.createEmployment(tx, { personId, legalEntityId: base.legalEntityId, employeeCode: `E-${label}`, hireDate: "2026-07-01", jobTitle: "Engineer" });
    const published = await publishEvent(tx, { topic: "employment.created", dedupeKey: employmentId, payload: { employmentId } });
    await runIdempotent(tx, "seed:test", `seed-${label}`, async () => {});
    return { ...base, roleId, roleAssignmentId, personId, employmentId, outboxEventId: published.id! };
  });
}
