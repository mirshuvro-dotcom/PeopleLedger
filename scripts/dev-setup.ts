/**
 * Developer environment setup: `pnpm dev:setup`.
 *
 * Rebuilds the local development database from scratch and fills it with
 * synthetic data (NFR-12) for the developer console:
 *   1. create the database named in PEOPLELEDGER_DB_MIGRATION_URL if missing
 *   2. cluster roles (db/roles.sql) and dev login users from the runtime URLs
 *   3. revert and re-apply all migrations (destructive, dev only)
 *   4. seed two synthetic tenants through the real repositories (audited)
 *   5. write .dev-seed.json (git-ignored) listing the synthetic identities
 *
 * Refuses to run unless PEOPLELEDGER_ENV=development and the database name ends in "_dev".
 */
import "./load-env.js";
import { writeFileSync } from "node:fs";
import pg from "pg";
import {
  assignRole,
  changeMembershipStatus,
  createLegalEntity,
  createPool,
  createRole,
  inviteMember,
  migrateDown,
  migrateUp,
  provisionTenant,
  withTenant,
  type RequestContext,
} from "@peopleledger/platform";
import { appendPersonVersion, createEmployment, createPerson } from "@peopleledger/people";

const env = process.env;
const need = (name: string) => {
  const v = env[name];
  if (!v) throw new Error(`${name} is required (see .env.example).`);
  return v;
};

if ((env.PEOPLELEDGER_ENV ?? "development") !== "development") throw new Error("dev:setup only runs with PEOPLELEDGER_ENV=development.");
const adminUrl = need("PEOPLELEDGER_DB_ADMIN_URL");
const migrationUrl = need("PEOPLELEDGER_DB_MIGRATION_URL");
const appUrl = need("PEOPLELEDGER_APP_DB_URL");
const workerUrl = need("PEOPLELEDGER_WORKER_DB_URL");
const platformUrl = need("PEOPLELEDGER_PLATFORM_DB_URL");
const database = new URL(migrationUrl).pathname.slice(1);
if (!/^[a-z0-9_]+_dev$/.test(database)) throw new Error(`Refusing to rebuild "${database}": the dev database name must end in _dev.`);
for (const url of [appUrl, workerUrl, platformUrl]) {
  if (new URL(url).pathname.slice(1) !== database) throw new Error("Runtime URLs must point at the same dev database as PEOPLELEDGER_DB_MIGRATION_URL.");
}

const step = (msg: string) => console.log(`• ${msg}`);

// 1–2. Database, roles, dev login users ---------------------------------------
const admin = new pg.Client({ connectionString: adminUrl });
await admin.connect();
try {
  const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [database]);
  if (exists.rowCount === 0) {
    await admin.query(`CREATE DATABASE ${database}`);
    step(`created database ${database}`);
  }
  const { readFileSync } = await import("node:fs");
  await admin.query(readFileSync(new URL("../db/roles.sql", import.meta.url), "utf8"));
  for (const [url, role] of [[appUrl, "pl_app"], [workerUrl, "pl_worker"], [platformUrl, "pl_platform"]] as const) {
    const u = new URL(url);
    const login = decodeURIComponent(u.username);
    const password = decodeURIComponent(u.password);
    if (!/^[a-z][a-z0-9_]{2,62}$/.test(login) || !password) throw new Error(`Runtime URL for ${role} needs a lowercase user name and a password.`);
    const found = await admin.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [login]);
    const pw = admin.escapeLiteral(password);
    await admin.query(found.rowCount === 0 ? `CREATE ROLE ${login} LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD ${pw} IN ROLE ${role}` : `ALTER ROLE ${login} PASSWORD ${pw}`);
  }
  step("runtime roles and dev login users ready");
} finally {
  await admin.end();
}

// 3. Rebuild schema -------------------------------------------------------------
const owner = new pg.Client({ connectionString: migrationUrl });
await owner.connect();
try {
  const reverted = await migrateDown(owner, { steps: 1000, allowDestructive: true });
  if (reverted.length) step(`reverted migrations ${reverted.join(", ")}`);
  step(`applied migrations ${(await migrateUp(owner)).join(", ")}`);
} finally {
  await owner.end();
}

// 4. Seed synthetic tenants -------------------------------------------------------
const appPool = createPool(appUrl, { environment: "development", applicationName: "dev-setup" });
const platformPool = createPool(platformUrl, { environment: "development", applicationName: "dev-setup" });

interface SeedUser { label: string; email: string; userId: string; membershipId: string; roles: string[]; status: string }
interface SeedTenant { tenantId: string; name: string; legalEntities: { id: string; name: string }[]; users: SeedUser[] }

const job = (tenantId: string): RequestContext => ({
  tenantId,
  actor: { type: "system-job", id: "job:dev-setup" },
  correlationId: `dev-setup-${Date.now()}`,
  source: "job",
});

const ALL = [
  "tenant:view", "legal_entity:view", "legal_entity:create", "legal_entity:edit", "membership:view", "membership:create", "membership:edit",
  "role:view", "role:create", "role:edit", "role_assignment:view", "role_assignment:create", "role_assignment:edit",
  "person:view", "person:create", "person:edit", "employment:view", "employment:create", "employment:edit", "audit_event:view", "audit_event:export",
];

async function seedTenant(spec: {
  name: string;
  entities: { en: string; bn?: string }[];
  users: { label: string; email: string; roles: { role: string; entity?: number }[]; status?: "active" | "invited" }[];
  roles: Record<string, string[]>;
  people: { en: string; bn?: string; birth: string; entity: number; code: string; hire: string; title: string; rename?: { en: string; from: string } }[];
}): Promise<SeedTenant> {
  const tenantId = await provisionTenant(platformPool, { actor: { type: "platform-operator", id: "platform:dev-setup" }, correlationId: "dev-setup" }, { name: spec.name, environment: "sandbox" });
  return withTenant(appPool, job(tenantId), async (tx) => {
    const entities: { id: string; name: string }[] = [];
    for (const e of spec.entities) entities.push({ id: await createLegalEntity(tx, { legalNameEn: e.en, ...(e.bn ? { legalNameBn: e.bn } : {}) }), name: e.en });
    const roleIds: Record<string, string> = {};
    for (const [name, perms] of Object.entries(spec.roles)) roleIds[name] = await createRole(tx, { name, description: "Synthetic developer role", permissions: perms });
    const users: SeedUser[] = [];
    for (const u of spec.users) {
      const { membershipId, userId } = await inviteMember(tx, u.email);
      if ((u.status ?? "active") === "active") await changeMembershipStatus(tx, { membershipId, expectedVersion: 1, status: "active", reason: "dev setup" });
      for (const r of u.roles) {
        const scope = r.entity === undefined ? ({ type: "tenant" } as const) : ({ type: "legal_entity", legalEntityId: entities[r.entity]!.id } as const);
        await assignRole(tx, { membershipId, roleId: roleIds[r.role]!, scope, effectiveFrom: "2026-07-01", reason: "dev setup" });
      }
      users.push({ label: u.label, email: u.email, userId, membershipId, status: u.status ?? "active", roles: u.roles.map((r) => (r.entity === undefined ? r.role : `${r.role} (${entities[r.entity]!.name})`)) });
    }
    for (const p of spec.people) {
      const { personId } = await createPerson(tx, { legalNameEn: p.en, ...(p.bn ? { legalNameBn: p.bn } : {}), birthDate: p.birth, effectiveFrom: p.hire });
      await createEmployment(tx, { personId, legalEntityId: entities[p.entity]!.id, employeeCode: p.code, hireDate: p.hire, jobTitle: p.title });
      if (p.rename) await appendPersonVersion(tx, { personId, expectedVersion: 1, effectiveFrom: p.rename.from, legalNameEn: p.rename.en, ...(p.bn ? { legalNameBn: p.bn } : {}), birthDate: p.birth });
    }
    return { tenantId, name: spec.name, legalEntities: entities, users };
  });
}

try {
  const software = await seedTenant({
    name: "Synthetic Software Ltd",
    entities: [{ en: "Synthetic Software Ltd", bn: "সিনথেটিক সফটওয়্যার লিমিটেড" }, { en: "Synthetic Services Ltd", bn: "সিনথেটিক সার্ভিসেস লিমিটেড" }],
    roles: {
      "Dev Administrator": ALL,
      "HR Officer": ["tenant:view", "legal_entity:view", "person:view", "person:create", "person:edit", "employment:view", "employment:create", "employment:edit"],
      Auditor: ["tenant:view", "legal_entity:view", "audit_event:view", "audit_event:export", "role:view", "role_assignment:view", "membership:view"],
      "Entity Viewer": ["employment:view"],
    },
    users: [
      { label: "Administrator", email: "admin@software.example.test", roles: [{ role: "Dev Administrator" }] },
      { label: "HR officer", email: "hr@software.example.test", roles: [{ role: "HR Officer" }] },
      { label: "Auditor", email: "auditor@software.example.test", roles: [{ role: "Auditor" }] },
      { label: "Services entity viewer", email: "viewer@software.example.test", roles: [{ role: "Entity Viewer", entity: 1 }] },
      { label: "Consultant (member of both tenants)", email: "consultant@example.test", roles: [] },
      { label: "Invited, not yet active", email: "newjoiner@software.example.test", roles: [], status: "invited" },
    ],
    people: [
      { en: "Test Employee One", bn: "পরীক্ষা কর্মী এক", birth: "1990-01-15", entity: 0, code: "SW-0001", hire: "2026-07-01", title: "Software Engineer" },
      { en: "Test Employee Two", bn: "পরীক্ষা কর্মী দুই", birth: "1988-05-20", entity: 0, code: "SW-0002", hire: "2026-07-01", title: "QA Engineer", rename: { en: "Test Employee Two-Renamed", from: "2026-10-01" } },
      { en: "Test Employee Three", bn: "পরীক্ষা কর্মী তিন", birth: "1995-11-02", entity: 0, code: "SW-0003", hire: "2026-08-15", title: "Product Designer" },
      { en: "Test Employee Four", bn: "পরীক্ষা কর্মী চার", birth: "1992-03-09", entity: 1, code: "SV-0001", hire: "2026-07-01", title: "Support Specialist" },
      { en: "Test Employee Five", bn: "পরীক্ষা কর্মী পাঁচ", birth: "1985-12-30", entity: 1, code: "SV-0002", hire: "2026-09-01", title: "Operations Lead" },
    ],
  });
  const trading = await seedTenant({
    name: "Synthetic Trading Ltd",
    entities: [{ en: "Synthetic Trading Ltd", bn: "সিনথেটিক ট্রেডিং লিমিটেড" }],
    roles: { "Dev Administrator": ALL, Auditor: ["tenant:view", "legal_entity:view", "audit_event:view", "role:view", "role_assignment:view", "membership:view"] },
    users: [
      { label: "Administrator", email: "admin@trading.example.test", roles: [{ role: "Dev Administrator" }] },
      { label: "Consultant (member of both tenants)", email: "consultant@example.test", roles: [{ role: "Auditor" }] },
    ],
    people: [
      { en: "Test Trader One", bn: "পরীক্ষা ব্যবসায়ী এক", birth: "1991-04-04", entity: 0, code: "TR-0001", hire: "2026-07-01", title: "Sales Executive" },
      { en: "Test Trader Two", bn: "পরীক্ষা ব্যবসায়ী দুই", birth: "1993-06-18", entity: 0, code: "TR-0002", hire: "2026-07-01", title: "Accounts Officer" },
    ],
  });
  writeFileSync(
    new URL("../.dev-seed.json", import.meta.url),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), note: "Synthetic developer identities. Local only; git-ignored.", tenants: [software, trading] }, null, 2)}\n`,
  );
  step("seeded 2 synthetic tenants, 8 memberships, 7 people; wrote .dev-seed.json");
  console.log("\nDone. Start the console with: pnpm dev   (then open http://localhost:3000)");
} finally {
  await Promise.all([appPool.end(), platformPool.end()]);
}
