import "./scripts/load-env.js";
import { defineConfig } from "vitest/config";

/**
 * Database tests need PostgreSQL 16+ reachable at PEOPLELEDGER_DB_ADMIN_URL
 * (default postgres://postgres:postgres@localhost:5432/postgres), set in the
 * environment or the local .env file (see .env.example). Each test
 * file gets its own freshly migrated database.
 */
export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.db.test.ts", "apps/api/test/**/*.db.test.ts"],
    globalSetup: ["packages/platform/test/db/global-setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
