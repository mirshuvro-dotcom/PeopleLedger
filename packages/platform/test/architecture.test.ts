/**
 * ARCH-04: modules own their table writes. Every INSERT/UPDATE/DELETE in a
 * package's runtime source must target a table whose data contract names that
 * package as owner. ARCH-05: migrations never run from runtime code.
 *
 * Requirements: ARCH-04, ARCH-05.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadDataContracts } from "../src/index.js";

const packagesDir = fileURLToPath(new URL("../../", import.meta.url));
/** Repo-relative path with forward slashes, on any OS. */
const rel = (file: string) => relative(packagesDir, file).split(sep).join("/");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? sourceFiles(p) : p.endsWith(".ts") ? [p] : [];
  });
}

const owners = new Map(loadDataContracts().entities.map((e) => [e.table, e.owner]));
const runtime = readdirSync(packagesDir).flatMap((pkg) => {
  try {
    return sourceFiles(join(packagesDir, pkg, "src")).map((file) => ({ pkg, file, text: readFileSync(file, "utf8") }));
  } catch {
    return [];
  }
});

describe("module ownership of writes (ARCH-04)", () => {
  const writes = runtime.flatMap(({ pkg, file, text }) =>
    [...text.matchAll(/\b(?:INSERT INTO|UPDATE|DELETE FROM)\s+([a-z_]+)/g)]
      .filter((m) => owners.has(m[1]!))
      .map((m) => ({ pkg, file: rel(file), table: m[1]! })),
  );

  it("finds the repository writes", () => {
    expect(new Set(writes.map((w) => w.pkg))).toEqual(new Set(["platform", "people"]));
  });

  it.each(writes.map((w) => [`${w.file} -> ${w.table}`, w] as const))("%s is written by its owning module", (_label, w) => {
    expect(owners.get(w.table)).toBe(w.pkg);
  });
});

describe("deployment units write only through module services (ARCH-04)", () => {
  it("apps contain no direct table writes", () => {
    const appsDir = fileURLToPath(new URL("../../../apps/", import.meta.url));
    const offenders = readdirSync(appsDir).flatMap((app) => {
      try {
        return sourceFiles(join(appsDir, app, "src"))
          .filter((file) => /\b(?:INSERT INTO|UPDATE|DELETE FROM)\s+[a-z_]+/.test(readFileSync(file, "utf8")))
          .map((file) => relative(appsDir, file).split(sep).join("/"));
      } catch {
        return [];
      }
    });
    expect(offenders).toEqual([]);
  });
});

describe("no migrations at startup (ARCH-05)", () => {
  it("only the migration module itself references migrateUp/migrateDown in runtime source", () => {
    const callers = runtime.filter(({ file, text }) => /migrate(Up|Down)\(/.test(text) && !rel(file).endsWith("db/migrate.ts"));
    expect(callers.map((c) => rel(c.file))).toEqual([]);
  });
});
