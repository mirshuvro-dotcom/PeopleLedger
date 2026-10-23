import { assertConnectionPolicy, DataKey, DbConfigError, type DbEnvironment } from "@peopleledger/platform";

/**
 * API configuration from the environment (or the git-ignored .env file).
 * Fails closed: unknown environments, missing URLs and developer identity in
 * production all stop the server from starting.
 */
export interface ApiConfig {
  readonly environment: DbEnvironment;
  readonly port: number;
  readonly host: string;
  readonly appDbUrl: string;
  /** Authentication service connection (role pl_auth). */
  readonly authDbUrl: string;
  /** Key for secrets at rest (TOTP secrets), NFR-01. */
  readonly dataKey: DataKey;
  /** Browser origin of the web app; requests carrying another Origin are refused (CSRF). */
  readonly webOrigin: string;
  /**
   * Developer identity: the caller names a synthetic tenant and user in
   * request headers. Stand-in until sign-in (IAM-01) exists. Never allowed in
   * production.
   */
  readonly devAuth: boolean;
  /** Repository root, for reading generated developer artifacts. */
  readonly repoRoot: URL;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const environment = (env.PEOPLELEDGER_ENV ?? "development") as DbEnvironment;
  if (!["production", "development", "test"].includes(environment)) {
    throw new DbConfigError(`Unknown PEOPLELEDGER_ENV "${environment}".`);
  }
  const devAuth = env.PEOPLELEDGER_DEV_AUTH === "enabled";
  if (devAuth && environment === "production") {
    throw new DbConfigError("PEOPLELEDGER_DEV_AUTH must not be enabled in production.");
  }
  const appDbUrl = required(env, "PEOPLELEDGER_APP_DB_URL");
  const authDbUrl = required(env, "PEOPLELEDGER_AUTH_DB_URL");
  assertConnectionPolicy(authDbUrl, environment);
  let dataKey: DataKey;
  try {
    dataKey = DataKey.fromBase64(env.PEOPLELEDGER_DATA_KEY);
  } catch {
    throw new DbConfigError("PEOPLELEDGER_DATA_KEY must be 32 random bytes, base64 encoded (pnpm dev:setup creates one for development).");
  }
  assertConnectionPolicy(appDbUrl, environment);
  const port = Number(env.PEOPLELEDGER_API_PORT ?? 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new DbConfigError("PEOPLELEDGER_API_PORT must be a port number.");
  return {
    environment,
    port,
    // Loopback by default; exposing the API on a network is a deliberate setting.
    host: env.PEOPLELEDGER_API_HOST ?? "127.0.0.1",
    appDbUrl,
    authDbUrl,
    dataKey,
    webOrigin: env.PEOPLELEDGER_WEB_ORIGIN ?? "http://localhost:3000",
    devAuth,
    repoRoot: new URL("../../../", import.meta.url),
  };
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) throw new DbConfigError(`${name} is required (see .env.example).`);
  return value;
}
