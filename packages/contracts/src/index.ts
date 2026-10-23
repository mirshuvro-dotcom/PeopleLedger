/**
 * Shared, serializable contracts between PeopleLedger modules (ARCH-03, ARCH-04).
 *
 * This package holds types and tiny pure helpers only. Business rules belong to
 * the owning module (platform, people, time, pay, insight); do not grow this into
 * an unrestricted business-logic package.
 */

declare const brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [brand]: B };

/** Opaque identifiers (Section 14.2: "Use opaque identifiers"). */
export type TenantId = Brand<string, "TenantId">;
export type LegalEntityId = Brand<string, "LegalEntityId">;
export type PersonId = Brand<string, "PersonId">;
export type EmploymentId = Brand<string, "EmploymentId">;
export type PayGroupId = Brand<string, "PayGroupId">;

/**
 * Calendar date without time or zone, `YYYY-MM-DD`. Business dates are kept
 * separate from event timestamps (Section 14.2, NFR-11).
 */
export type IsoDate = Brand<string, "IsoDate">;

/** UTC event timestamp, ISO 8601 with `Z`. */
export type UtcTimestamp = Brand<string, "UtcTimestamp">;

/**
 * Exact decimal amount serialized as a string, e.g. `"2291.67"`. Never a JS
 * number: binary floating point is prohibited for money (PRN-06).
 */
export type DecimalString = Brand<string, "DecimalString">;

export type CurrencyCode = "BDT";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DECIMAL = /^-?\d+(\.\d+)?$/;

export function isoDate(value: string): IsoDate {
  const m = ISO_DATE.exec(value);
  if (!m) throw new ContractError("INVALID_DATE", `Not an ISO date: ${value}`);
  const [, y, mo, d] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  if (date.toISOString().slice(0, 10) !== value) {
    throw new ContractError("INVALID_DATE", `Not a real calendar date: ${value}`);
  }
  return value as IsoDate;
}

export function decimalString(value: string): DecimalString {
  if (!DECIMAL.test(value)) {
    throw new ContractError("INVALID_DECIMAL", `Not a decimal string: ${value}`);
  }
  return value as DecimalString;
}

/** Lexical comparison is correct for validated `YYYY-MM-DD` strings. */
export function compareIsoDate(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * A reason-coded issue (PRN-03). `blocking` issues stop the affected
 * calculation; `warning` issues require review but do not block.
 */
export interface Issue {
  readonly code: string;
  readonly severity: "blocking" | "warning";
  readonly message: string;
  /** Requirement or open legal item that explains the block, e.g. `LAW-05`, `L-26`. */
  readonly refs: readonly string[];
  /** Who must act to resolve it (an accountable role, not a person). */
  readonly owner?: string;
}

export class ContractError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ContractError";
  }
}
