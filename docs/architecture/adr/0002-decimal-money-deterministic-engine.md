# ADR-0002: Exact decimal money and a pure, hash-traced calculation engine

- Status: Accepted
- Requirements: PRN-01, PRN-06, ARCH-03, LAW-09, Section 14.3, AC-09

## Decision

**Money.** Amounts cross module boundaries as `DecimalString` (validated string, never a JS `number`). Inside
`@peopleledger/pay` they are `Dec`, a private `decimal.js` clone with 60 significant digits and no global
configuration. Intermediate values stay unrounded; rounding happens only through a `RoundingRule` taken from the
rule pack, so each rounding point is visible in the trace.

**Engine contract.** `calculatePayroll(snapshot, legalPack, policyPack, engineVersion)` follows Section 14.3:

- Pure: no clock, environment, I/O or tenant configuration. Everything is in the snapshot.
- Returns `status` (`calculated` | `blocked`), amounts, an ordered `ruleTrace` naming the pack parameter or engine
  mechanism for each step, `warnings`, `blockingErrors`, and `traceHash`.
- `traceHash` = sha256 of canonical JSON (sorted keys) over the result body and the snapshot hash. Identical inputs
  give identical hashes; any input change changes the hash.
- A blocked result has `amounts: null`. Callers cannot accidentally display partial numbers.
- The engine refuses an `engineVersion` other than its own, so reproduction must load the original engine artifact
  (LAW-09) rather than quietly recomputing with today's code.

**Ledger draft.** Each calculation emits a balanced draft (salary expense = net pay payable + tax payable).
Posting, immutability and reversal are later features (PAY-11, PRN-04).

## Alternatives considered

- Integer paisa (`bigint`): exact, but tax formulas need fractions (one-third exemption, average-rate division)
  and rounding at legally defined points, which is clearer with a decimal type.
- Global `Decimal.set(...)`: rejected; any other library could change our rounding.

## Consequences

- Changing any arithmetic or ordering is a new engine major version (`ENGINE_VERSION`), recorded in results.
- Persisting artifacts by engine version (so old runs can be replayed) is still to be built.
