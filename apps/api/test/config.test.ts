/**
 * API configuration fails closed.
 * Requirements: NFR-01 (TLS in production, data key for secrets), SEC-01 (no developer identity in production).
 */
import { describe, expect, it } from "vitest";
import { DataKey } from "@peopleledger/platform";
import { loadConfig } from "../src/config.js";

const base = { PEOPLELEDGER_APP_DB_URL: "postgres://u:p@localhost/x_dev", PEOPLELEDGER_AUTH_DB_URL: "postgres://a:p@localhost/x_dev", PEOPLELEDGER_DATA_KEY: DataKey.generateBase64() };

describe("API configuration", () => {
  it("refuses developer identity in production", () => {
    expect(() =>
      loadConfig({ ...base, PEOPLELEDGER_ENV: "production", PEOPLELEDGER_DEV_AUTH: "enabled", PEOPLELEDGER_APP_DB_URL: "postgres://u:p@db/x?sslmode=verify-full", PEOPLELEDGER_AUTH_DB_URL: "postgres://a:p@db/x?sslmode=verify-full" }),
    ).toThrow(/DEV_AUTH/);
  });

  it("requires TLS database connections in production", () => {
    expect(() => loadConfig({ ...base, PEOPLELEDGER_ENV: "production" })).toThrow(/sslmode/);
  });

  it("requires the database URL and a known environment", () => {
    expect(() => loadConfig({})).toThrow(/PEOPLELEDGER_APP_DB_URL/);
    expect(() => loadConfig({ ...base, PEOPLELEDGER_ENV: "staging" })).toThrow(/Unknown/);
  });

  it("requires a 32-byte data key for secrets at rest", () => {
    expect(() => loadConfig({ ...base, PEOPLELEDGER_DATA_KEY: "short" })).toThrow(/DATA_KEY/);
    expect(() => loadConfig({ ...base, PEOPLELEDGER_DATA_KEY: undefined })).toThrow(/DATA_KEY/);
  });

  it("binds to loopback by default and enables developer identity only when asked", () => {
    expect(loadConfig(base)).toMatchObject({ environment: "development", host: "127.0.0.1", port: 4000, devAuth: false });
    expect(loadConfig({ ...base, PEOPLELEDGER_DEV_AUTH: "enabled" }).devAuth).toBe(true);
  });
});
