import { ContractError, type LegalEntityId, type TenantId } from "@peopleledger/contracts";

/**
 * Platform module: tenants, legal entities and the tenant boundary (PRN-07).
 * Persistence, identity, roles and audit arrive in Phase 1; this file holds the
 * in-memory shapes the vertical slice needs and the one invariant every module
 * relies on: data never crosses a tenant boundary.
 */

export interface Tenant {
  readonly id: TenantId;
  readonly name: string;
  /** Sandbox tenants can never send email or money (PLT-03). */
  readonly environment: "production" | "sandbox";
}

export interface LegalEntity {
  readonly id: LegalEntityId;
  readonly tenantId: TenantId;
  readonly legalName: { readonly en: string; readonly bn?: string };
  /**
   * ORG-08: payroll stays disabled until the applicability checklist is
   * complete. Nothing in this repository can set it true yet.
   */
  readonly productionPayrollEnabled: false;
}

export interface TenantScoped {
  readonly tenantId: TenantId;
}

/**
 * Throws unless the record belongs to the caller's tenant. Use at every
 * module boundary that receives a record by id (AC-01). The error does not
 * echo the foreign tenant id, so it cannot disclose another tenant's presence
 * (EMP-10).
 */
export function assertTenant<T extends TenantScoped>(context: TenantId, record: T): T {
  if (record.tenantId !== context) {
    throw new ContractError("TENANT_BOUNDARY", "Record not found.");
  }
  return record;
}

export * from "./db/index.js";
