import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type pg from "pg";

/**
 * Forward-only by default migration runner (ARCH-05).
 *
 * - Never invoked on application startup; only scripts/db.ts and tests call it.
 * - Each migration declares `-- phase: expand | migrate | contract`. Contract
 *   (destructive) migrations need `allowContract`; every down migration needs
 *   `allowDestructive`.
 * - Applied scripts are checksummed; editing an applied migration is an error.
 * - A session advisory lock prevents two runners from interleaving.
 */
export type MigrationPhase = "expand" | "migrate" | "contract";

export interface Migration {
  readonly version: string;
  readonly name: string;
  readonly phase: MigrationPhase;
  readonly owner: string;
  readonly up: string;
  readonly down: string;
  readonly checksum: string;
}

export const DEFAULT_MIGRATIONS_DIR = new URL("../../../../db/migrations/", import.meta.url).pathname;
const LOCK_KEY = 7_316_220_901; // arbitrary constant for pg_advisory_lock

export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationError";
  }
}

export function loadMigrations(dir: string = DEFAULT_MIGRATIONS_DIR): Migration[] {
  const files = readdirSync(dir);
  const ups = files.filter((f) => /^\d{4}_[a-z0-9_]+\.up\.sql$/.test(f)).sort();
  return ups.map((file) => {
    const [, version, name] = /^(\d{4})_([a-z0-9_]+)\.up\.sql$/.exec(file)!;
    const up = readFileSync(join(dir, file), "utf8");
    const downFile = `${version}_${name}.down.sql`;
    if (!files.includes(downFile)) throw new MigrationError(`${file} has no ${downFile}`);
    const phase = /^-- phase: (expand|migrate|contract)\s*$/m.exec(up)?.[1] as MigrationPhase | undefined;
    const owner = /^-- owner: ([a-z]+)\s*$/m.exec(up)?.[1];
    if (!phase || !owner) throw new MigrationError(`${file} must declare "-- phase:" and "-- owner:"`);
    return {
      version: version!,
      name: name!,
      phase,
      owner,
      up,
      down: readFileSync(join(dir, downFile), "utf8"),
      checksum: createHash("sha256").update(up, "utf8").digest("hex"),
    };
  });
}

export interface AppliedMigration {
  readonly version: string;
  readonly name: string;
  readonly phase: MigrationPhase;
  readonly checksum: string;
}

async function ensureTable(client: pg.ClientBase): Promise<void> {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    text PRIMARY KEY,
    name       text NOT NULL,
    phase      text NOT NULL CHECK (phase IN ('expand', 'migrate', 'contract')),
    checksum   text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    applied_by text NOT NULL DEFAULT current_user
  )`);
}

export async function appliedMigrations(client: pg.ClientBase): Promise<AppliedMigration[]> {
  await ensureTable(client);
  const r = await client.query<AppliedMigration>("SELECT version, name, phase, checksum FROM schema_migrations ORDER BY version");
  return r.rows;
}

async function withLock<T>(client: pg.ClientBase, fn: () => Promise<T>): Promise<T> {
  await client.query("SELECT pg_advisory_lock($1)", [LOCK_KEY]);
  try {
    return await fn();
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]);
  }
}

export interface UpOptions {
  readonly dir?: string;
  readonly allowContract?: boolean;
  /** Apply up to and including this version. */
  readonly to?: string;
}

/** Apply pending migrations in order, each in its own transaction. Returns applied versions. */
export async function migrateUp(client: pg.ClientBase, options: UpOptions = {}): Promise<string[]> {
  const all = loadMigrations(options.dir);
  return withLock(client, async () => {
    const applied = new Map((await appliedMigrations(client)).map((m) => [m.version, m]));
    for (const m of all) {
      const a = applied.get(m.version);
      if (a && a.checksum !== m.checksum) {
        throw new MigrationError(`Migration ${m.version}_${m.name} was edited after it was applied (checksum mismatch).`);
      }
    }
    const pending = all.filter((m) => !applied.has(m.version) && (options.to === undefined || m.version <= options.to));
    const blocked = pending.find((m) => m.phase === "contract" && !options.allowContract);
    if (blocked) {
      throw new MigrationError(`Migration ${blocked.version}_${blocked.name} is a contract (destructive) migration; rerun with allowContract after confirming no running code depends on it.`);
    }
    const done: string[] = [];
    for (const m of pending) {
      await client.query("BEGIN");
      try {
        await client.query(m.up);
        await client.query("INSERT INTO schema_migrations (version, name, phase, checksum) VALUES ($1, $2, $3, $4)", [m.version, m.name, m.phase, m.checksum]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw new MigrationError(`Migration ${m.version}_${m.name} failed: ${(error as Error).message}`);
      }
      done.push(m.version);
    }
    return done;
  });
}

export interface DownOptions {
  readonly dir?: string;
  /** Number of most recent migrations to revert. */
  readonly steps: number;
  /** Down migrations drop data. Must be true; refused without it. */
  readonly allowDestructive: boolean;
}

export async function migrateDown(client: pg.ClientBase, options: DownOptions): Promise<string[]> {
  if (!options.allowDestructive) {
    throw new MigrationError("Down migrations destroy data; pass allowDestructive explicitly.");
  }
  const all = new Map(loadMigrations(options.dir).map((m) => [m.version, m]));
  return withLock(client, async () => {
    const applied = (await appliedMigrations(client)).reverse().slice(0, options.steps);
    const reverted: string[] = [];
    for (const a of applied) {
      const m = all.get(a.version);
      if (!m) throw new MigrationError(`Applied migration ${a.version} has no file to revert with.`);
      await client.query("BEGIN");
      try {
        await client.query(m.down);
        await client.query("DELETE FROM schema_migrations WHERE version = $1", [a.version]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw new MigrationError(`Revert of ${a.version}_${a.name} failed: ${(error as Error).message}`);
      }
      reverted.push(a.version);
    }
    return reverted;
  });
}
