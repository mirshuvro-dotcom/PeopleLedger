import {
  ContractError,
  type DecimalString,
  type EmploymentId,
  type IsoDate,
  type LegalEntityId,
  type PersonId,
  type TenantId,
  type UtcTimestamp,
} from "@peopleledger/contracts";

/**
 * People module: Person / Employment separation (EMP-01) and effective-dated
 * history (PRN-05, EMP-08). In-memory shapes for the vertical slice; the
 * PostgreSQL schema with RLS follows the GOV-03 entity contracts in Phase 1.
 */

export interface Person {
  readonly id: PersonId;
  readonly tenantId: TenantId;
  readonly legalName: { readonly en: string; readonly bn?: string };
  readonly birthDate?: IsoDate;
}

export interface Employment {
  readonly id: EmploymentId;
  readonly tenantId: TenantId;
  readonly personId: PersonId;
  readonly legalEntityId: LegalEntityId;
  readonly employeeCode: string;
  readonly hireDate: IsoDate;
  readonly endDate?: IsoDate;
}

/**
 * One version of an effective-dated value. `effectiveFrom`/`effectiveTo` are
 * business dates (inclusive); `recordedAt` is when the fact was entered, so a
 * backdated correction is identifiable (EMP-08).
 */
export interface EffectiveVersion<T> {
  readonly effectiveFrom: IsoDate;
  /** Inclusive end; omitted means open-ended. */
  readonly effectiveTo?: IsoDate;
  readonly recordedAt: UtcTimestamp;
  readonly recordedBy: string;
  readonly value: T;
}

export interface CompensationLine {
  readonly componentCode: string;
  readonly label: { readonly en: string; readonly bn: string };
  readonly monthlyAmount: DecimalString;
}

export interface CompensationAgreement {
  readonly employmentId: EmploymentId;
  readonly tenantId: TenantId;
  readonly versions: readonly EffectiveVersion<readonly CompensationLine[]>[];
}

/**
 * Section 14.2: effective-dated intervals must not overlap where a single
 * active value is required. Returns the versions sorted by start date.
 */
export function validateNonOverlapping<T>(versions: readonly EffectiveVersion<T>[]): EffectiveVersion<T>[] {
  const sorted = [...versions].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : a.effectiveFrom > b.effectiveFrom ? 1 : 0));
  for (let i = 0; i < sorted.length; i++) {
    const v = sorted[i]!;
    if (v.effectiveTo !== undefined && v.effectiveTo < v.effectiveFrom) {
      throw new ContractError("EFFECTIVE_RANGE_INVALID", `Version starting ${v.effectiveFrom} ends before it starts.`);
    }
    const next = sorted[i + 1];
    if (next && (v.effectiveTo === undefined || v.effectiveTo >= next.effectiveFrom)) {
      throw new ContractError("EFFECTIVE_RANGE_OVERLAP", `Versions starting ${v.effectiveFrom} and ${next.effectiveFrom} overlap.`);
    }
  }
  return sorted;
}

/** The version in force on `date`, or `undefined` when none applies. */
export function versionAsOf<T>(versions: readonly EffectiveVersion<T>[], date: IsoDate): EffectiveVersion<T> | undefined {
  return validateNonOverlapping(versions).find(
    (v) => v.effectiveFrom <= date && (v.effectiveTo === undefined || date <= v.effectiveTo),
  );
}

/**
 * Append a new version that starts on `effectiveFrom`, closing the version in
 * force the day before. Earlier history is preserved, never rewritten
 * (PRN-05). Backdating into a closed period is a correction workflow, not this
 * function, so it is refused here.
 */
export function appendVersion<T>(
  versions: readonly EffectiveVersion<T>[],
  next: Omit<EffectiveVersion<T>, "effectiveTo">,
): EffectiveVersion<T>[] {
  const sorted = validateNonOverlapping(versions);
  const last = sorted[sorted.length - 1];
  if (last && next.effectiveFrom <= last.effectiveFrom) {
    throw new ContractError("BACKDATED_CHANGE_REQUIRES_CORRECTION", "New version must start after the latest version; use the correction workflow.");
  }
  if (last && last.effectiveTo !== undefined && last.effectiveTo >= next.effectiveFrom) {
    throw new ContractError("EFFECTIVE_RANGE_OVERLAP", "Latest version already extends past the new start date.");
  }
  const closed = last && last.effectiveTo === undefined ? { ...last, effectiveTo: dayBefore(next.effectiveFrom) } : last;
  return [...sorted.slice(0, -1), ...(closed ? [closed] : []), { ...next }];
}

function dayBefore(date: IsoDate): IsoDate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10) as IsoDate;
}

export * from "./repository.js";
