/**
 * Database operations CLI. Migrations are never run on application startup
 * (ARCH-05); this script is the only operator entry point.
 *
 *   pnpm db roles                                 create cluster roles (db/roles.sql), cluster admin only
 *   pnpm db status                                list applied and pending migrations
 *   pnpm db up [--allow-contract]                 apply pending migrations
 *   pnpm db down --steps N --allow-destructive    revert N migrations (refused when PEOPLELEDGER_ENV=production)
 *
 * Connection: PEOPLELEDGER_DB_MIGRATION_URL (the schema-owner role, not a runtime role), from the
 * environment or the local .env file (see .env.example).
 */
import "./load-env.js";
import { readFileSync } from "node:fs";
import pg from "pg";
import { appliedMigrations, assertConnectionPolicy, loadMigrations, migrateDown, migrateUp, type DbEnvironment } from "@peopleledger/platform";

const [command, ...args] = process.argv.slice(2);
const url = process.env.PEOPLELEDGER_DB_MIGRATION_URL;
const environment = (process.env.PEOPLELEDGER_ENV ?? "development") as DbEnvironment;
if (!url) {
  console.error("Set PEOPLELEDGER_DB_MIGRATION_URL to the schema-owner connection string.");
  process.exit(2);
}
assertConnectionPolicy(url, environment);

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  switch (command) {
    case "roles":
      await client.query(readFileSync(new URL("../db/roles.sql", import.meta.url), "utf8"));
      console.log("Runtime roles present: pl_app, pl_worker, pl_platform");
      break;
    case "status": {
      const applied = new Set((await appliedMigrations(client)).map((m) => m.version));
      for (const m of loadMigrations()) console.log(`${applied.has(m.version) ? "applied" : "pending"}  ${m.version}_${m.name}  (${m.phase}, ${m.owner})`);
      break;
    }
    case "up": {
      const done = await migrateUp(client, { allowContract: args.includes("--allow-contract") });
      console.log(done.length ? `Applied ${done.join(", ")}` : "Nothing to apply");
      break;
    }
    case "down": {
      if (environment === "production") throw new Error("Down migrations are refused in production; write a forward fix.");
      const steps = Number(args[args.indexOf("--steps") + 1]);
      if (!Number.isInteger(steps) || steps < 1) throw new Error("--steps N is required");
      const done = await migrateDown(client, { steps, allowDestructive: args.includes("--allow-destructive") });
      console.log(`Reverted ${done.join(", ")}`);
      break;
    }
    default:
      console.error("Usage: pnpm db roles|status|up|down");
      process.exitCode = 2;
  }
} finally {
  await client.end();
}
