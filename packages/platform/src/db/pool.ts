import pg from "pg";
import { DbConfigError } from "./errors.js";

export type DbEnvironment = "production" | "development" | "test";

const TLS_MODES = new Set(["require", "verify-ca", "verify-full"]);
const DATE_OID = 1082;

/**
 * NFR-01: production connections must use TLS. Fails closed on a connection
 * string without an encrypting `sslmode`.
 */
export function assertConnectionPolicy(url: string, environment: DbEnvironment): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new DbConfigError("Database URL is not a valid URL.");
  }
  if (environment === "production" && !TLS_MODES.has(parsed.searchParams.get("sslmode") ?? "")) {
    throw new DbConfigError("Production database connections require sslmode=verify-full (or require/verify-ca).");
  }
}

/**
 * Create a pool for one runtime role (app, worker or platform). Business dates
 * (`date`) are returned as `YYYY-MM-DD` strings, never JS Dates, so no timezone
 * shift can occur (NFR-11).
 */
export function createPool(
  url: string,
  options: { environment: DbEnvironment; applicationName: string; max?: number },
): pg.Pool {
  assertConnectionPolicy(url, options.environment);
  return new pg.Pool({
    connectionString: url,
    max: options.max ?? 10,
    application_name: options.applicationName,
    types: {
      getTypeParser: ((oid: number, format?: "text" | "binary") =>
        oid === DATE_OID ? (value: string) => value : pg.types.getTypeParser(oid, format)) as typeof pg.types.getTypeParser,
    },
  });
}
