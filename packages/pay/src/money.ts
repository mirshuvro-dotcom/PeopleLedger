import DecimalJs from "decimal.js";
import { decimalString, type DecimalString } from "@peopleledger/contracts";

/**
 * Isolated Decimal constructor for financial arithmetic (PRN-06).
 *
 * A private clone keeps global decimal.js configuration from leaking in or out.
 * Precision is far above any payroll magnitude so intermediate values are exact;
 * rounding happens only at points named by an approved rule (`roundWith`).
 */
export const Dec = DecimalJs.clone({
  precision: 60,
  rounding: DecimalJs.ROUND_HALF_UP,
  toExpNeg: -60,
  toExpPos: 60,
});
export type Dec = InstanceType<typeof Dec>;

export type RoundingMode = "HALF_UP" | "HALF_EVEN" | "UP" | "DOWN";

export interface RoundingRule {
  /** Number of decimal places kept, e.g. 0 for whole taka, 2 for paisa. */
  readonly scale: number;
  readonly mode: RoundingMode;
}

const MODES: Record<RoundingMode, DecimalJs.Rounding> = {
  HALF_UP: DecimalJs.ROUND_HALF_UP,
  HALF_EVEN: DecimalJs.ROUND_HALF_EVEN,
  UP: DecimalJs.ROUND_UP,
  DOWN: DecimalJs.ROUND_DOWN,
};

export function dec(value: DecimalString | string): Dec {
  return new Dec(decimalString(value));
}

export function roundWith(value: Dec, rule: RoundingRule): Dec {
  return value.toDecimalPlaces(rule.scale, MODES[rule.mode]);
}

/** Serialize without exponent notation; trailing zeros are fixed to `scale` when given. */
export function toDecimalString(value: Dec, scale?: number): DecimalString {
  return decimalString(scale === undefined ? value.toFixed() : value.toFixed(scale));
}

export function sum(values: readonly Dec[]): Dec {
  return values.reduce((acc, v) => acc.plus(v), new Dec(0));
}

export function min(a: Dec, b: Dec): Dec {
  return a.lessThan(b) ? a : b;
}

export function max(a: Dec, b: Dec): Dec {
  return a.greaterThan(b) ? a : b;
}
