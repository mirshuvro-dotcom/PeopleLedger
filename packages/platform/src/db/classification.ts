import { readFileSync } from "node:fs";

/**
 * Field classification and entity contracts (GOV-03, NFR-01, AUD-03).
 * Source of truth: db/contracts/entities.json. Field-level enforcement in the
 * API and UI is later work (RBAC-04); today the classification drives audit
 * redaction and log redaction.
 */
export type FieldClassification = "public" | "employee" | "hr-restricted" | "payroll-restricted" | "medical";
export type OwnerModule = "platform" | "people" | "time" | "pay" | "insight";

export interface ColumnContract {
  readonly type: string;
  readonly nullable: boolean;
  readonly classification: FieldClassification;
  readonly api: string | null;
  readonly description: string;
}

export interface EntityContract {
  readonly table: string;
  readonly owner: OwnerModule;
  readonly tenantScoped: boolean;
  readonly runtimeAccess: boolean;
  readonly kind: string;
  readonly description: string;
  readonly retentionClass: string;
  readonly apiResource: string | null;
  readonly writePath: string;
  readonly migration: string;
  readonly constraints: readonly string[];
  readonly columns: Readonly<Record<string, ColumnContract>>;
}

export interface DataContracts {
  readonly contractVersion: number;
  readonly classifications: Readonly<Record<FieldClassification, string>>;
  readonly retentionClasses: Readonly<Record<string, string>>;
  readonly entities: readonly EntityContract[];
}

export const CONTRACTS_PATH = new URL("../../../../db/contracts/entities.json", import.meta.url);

let cached: DataContracts | undefined;

export function loadDataContracts(): DataContracts {
  cached ??= JSON.parse(readFileSync(CONTRACTS_PATH, "utf8")) as DataContracts;
  return cached;
}

export function entityContract(table: string): EntityContract {
  const entity = loadDataContracts().entities.find((e) => e.table === table);
  if (!entity) throw new Error(`No data contract for table ${table}`);
  return entity;
}

const OPEN: ReadonlySet<FieldClassification> = new Set(["public", "employee"]);

/** Unknown columns are treated as restricted: fail closed. */
export function isRestricted(table: string, column: string): boolean {
  const c = loadDataContracts().entities.find((e) => e.table === table)?.columns[column];
  return !c || !OPEN.has(c.classification);
}

/**
 * NFR-01 log redaction: keep public/employee fields, replace everything else
 * (and anything unknown) with a marker naming its class.
 */
export function redactRow(table: string, row: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const columns = loadDataContracts().entities.find((e) => e.table === table)?.columns ?? {};
  return Object.fromEntries(
    Object.entries(row).map(([k, v]) => {
      const c = columns[k];
      return [k, c && OPEN.has(c.classification) ? v : `[redacted:${c?.classification ?? "unclassified"}]`];
    }),
  );
}
