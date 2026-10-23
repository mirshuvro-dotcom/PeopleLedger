import { describe, expect, it } from "vitest";
import type { TenantId } from "@peopleledger/contracts";
import { assertTenant } from "../src/index.js";

describe("tenant boundary (PRN-07, AC-01)", () => {
  const a = "tnt_a" as TenantId;
  const b = "tnt_b" as TenantId;

  it("returns records of the caller's tenant", () => {
    expect(assertTenant(a, { tenantId: a, x: 1 }).x).toBe(1);
  });

  it("rejects another tenant's record without disclosing it", () => {
    expect(() => assertTenant(a, { tenantId: b })).toThrow("Record not found.");
  });
});
