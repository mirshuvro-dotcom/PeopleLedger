import { describe, expect, it } from "vitest";
import { isoDate, type UtcTimestamp } from "@peopleledger/contracts";
import { appendVersion, validateNonOverlapping, versionAsOf, type EffectiveVersion } from "../src/index.js";

const at = "2026-07-01T00:00:00Z" as UtcTimestamp;
const v = (from: string, value: string, to?: string): EffectiveVersion<string> => ({
  effectiveFrom: isoDate(from),
  ...(to ? { effectiveTo: isoDate(to) } : {}),
  recordedAt: at,
  recordedBy: "hr@example.test",
  value,
});

describe("effective-dated history (PRN-05, EMP-08)", () => {
  it("closes the previous version and keeps it when appending", () => {
    const history = appendVersion([v("2026-07-01", "50k")], v("2027-01-01", "100k"));
    expect(history.map((h) => [h.effectiveFrom, h.effectiveTo, h.value])).toEqual([
      ["2026-07-01", "2026-12-31", "50k"],
      ["2027-01-01", undefined, "100k"],
    ]);
    expect(versionAsOf(history, isoDate("2026-12-31"))?.value).toBe("50k");
    expect(versionAsOf(history, isoDate("2027-01-01"))?.value).toBe("100k");
    expect(versionAsOf(history, isoDate("2026-06-30"))).toBeUndefined();
  });

  it("handles a leap-year month end when closing a version", () => {
    const history = appendVersion([v("2027-07-01", "a")], v("2028-03-01", "b"));
    expect(history[0]!.effectiveTo).toBe("2028-02-29");
  });

  it("rejects overlapping intervals", () => {
    expect(() => validateNonOverlapping([v("2026-07-01", "a", "2026-12-31"), v("2026-12-31", "b")])).toThrow(/overlap/);
  });

  it("refuses silent backdating; corrections need their own workflow", () => {
    expect(() => appendVersion([v("2026-07-01", "a")], v("2026-07-01", "b"))).toThrow(/correction/);
  });
});
