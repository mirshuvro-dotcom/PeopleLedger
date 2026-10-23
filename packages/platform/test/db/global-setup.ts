import { readFileSync } from "node:fs";
import pg from "pg";
import { ADMIN_URL, LOGINS, redactedAdminUrl, TEST_ROLE_PASSWORD } from "./env.js";

/** Create cluster roles (db/roles.sql) and synthetic test login users once per run. */
export default async function setup(): Promise<void> {
  const client = new pg.Client({ connectionString: ADMIN_URL });
  try {
    await client.connect();
  } catch (error) {
    throw new Error(
      `Database tests need PostgreSQL at PEOPLELEDGER_DB_ADMIN_URL (${redactedAdminUrl()}): ${(error as Error).message}. ` +
        "Set it to postgres://postgres:<your postgres password>@localhost:5432/postgres (URL-encode special characters).",
    );
  }
  try {
    await client.query(readFileSync(new URL("../../../../db/roles.sql", import.meta.url), "utf8"));
    const grants: Record<string, string> = { [LOGINS.app]: "pl_app", [LOGINS.worker]: "pl_worker", [LOGINS.platform]: "pl_platform", [LOGINS.auth]: "pl_auth" };
    for (const [login, role] of Object.entries(grants)) {
      const exists = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [login]);
      const pw = client.escapeLiteral(TEST_ROLE_PASSWORD);
      if (exists.rowCount === 0) {
        await client.query(`CREATE ROLE ${login} LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD ${pw} IN ROLE ${role}`);
      } else {
        await client.query(`ALTER ROLE ${login} PASSWORD ${pw}`);
      }
    }
  } finally {
    await client.end();
  }
}
