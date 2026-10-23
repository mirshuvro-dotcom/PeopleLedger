/** Test-only connection settings. The password is synthetic and only ever used against a disposable test cluster. */
export const ADMIN_URL = process.env.PEOPLELEDGER_DB_ADMIN_URL ?? "postgres://postgres:postgres@localhost:5432/postgres";
export const TEST_ROLE_PASSWORD = process.env.PEOPLELEDGER_TEST_ROLE_PASSWORD ?? "synthetic-test-only";
export const LOGINS = { app: "pl_app_login", worker: "pl_worker_login", platform: "pl_platform_login" } as const;

export function urlFor(database: string, user?: string): string {
  const u = new URL(ADMIN_URL);
  u.pathname = `/${database}`;
  if (user) {
    u.username = user;
    u.password = TEST_ROLE_PASSWORD;
  }
  return u.toString();
}

/** The admin URL with its password masked, safe to print in error messages. */
export function redactedAdminUrl(): string {
  try {
    const u = new URL(ADMIN_URL);
    if (u.password) u.password = "****";
    return u.toString();
  } catch {
    return "(unparseable URL)";
  }
}
