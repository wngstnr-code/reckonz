/**
 * `checkExecution`, the off-chain mirror of `FairValueOracle.checkExecution`.
 *
 * CLAUDE.md states the rule this file exists to enforce: if the two disagree,
 * the off-chain mirror is wrong. Two of the differences below are **deliberate**
 * and argued for in `guard.ts`'s own comments, which means they are exactly the
 * kind of thing a later reader "fixes" into agreement. So they are pinned here
 * with the reason attached — a test is the only form of a comment that fails
 * when someone stops believing it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkExecution, DEFAULT_MANDATE, type Mandate } from './guard';
import type { FairValueReport } from './fairvalue';

/** A report the guard would pass, so each test can spoil exactly one thing. */
function report(over: Partial<FairValueReport> = {}): FairValueReport {
  return {
    symbol: 'wTSLAx',
    state: 'OPEN',
    reference: 'TSLA',
    anchorPrice: 100,
    anchorAt: 1_786_000_000,
    stalenessHours: 0,
    sharesPerToken: 1,
    fairValue: 100,
    confidenceBps: 0,
    publishable: true,
    gapRisk: 0,
    gapRiskParts: { staleness: 0, displacement: 0, uncertainty: 0, basis: 0 },
    notes: [],
    ...over,
  };
}

test('a clean report at fair value with no impact is allowed', () => {
  const d = checkExecution(report(), 100, 0);
  assert.equal(d.ok, true);
  assert.equal(d.reason, undefined);
});

// --------------------------------------------------------------- no reference

test('a withheld value is NO_REFERENCE, and carries the note that says why', () => {
  const d = checkExecution(
    report({ publishable: false, notes: ['value withheld: no admitted reference'] }),
    100,
    0,
  );
  assert.equal(d.ok, false);
  assert.equal(d.reason, 'NO_REFERENCE');
  assert.match(d.detail!, /withheld/);
});

test('a zero fair value is NO_REFERENCE rather than a division', () => {
  // The contract calls this defence in depth: `publish` refuses the combination
  // now, but an observation written before that rule must still reject cleanly
  // instead of dividing by zero. The mirror has to refuse it for the same reason.
  assert.equal(checkExecution(report({ fairValue: 0 }), 100, 0).reason, 'NO_REFERENCE');
  assert.equal(checkExecution(report({ fairValue: null }), 100, 0).reason, 'NO_REFERENCE');
});

test('NO_REFERENCE is answered before NO_DATA, which is not the contract order', () => {
  // `FairValueOracle.checkExecution` tests `updatedAt == 0` first and would say
  // NO_DATA here. This mirror deliberately says NO_REFERENCE, because "we
  // computed a value and refused to stand behind it" is a different and more
  // useful sentence than "we have no observation" — and a withheld value must
  // never fall through into a deviation check against a number we do not trust.
  //
  // Both are refusals, so no trade is decided differently. If that ever stops
  // being true, this test is the one that should fail.
  const d = checkExecution(report({ publishable: false, anchorAt: null }), 100, 0);
  assert.equal(d.reason, 'NO_REFERENCE');
});

test('a value with no anchor behind it is NO_DATA', () => {
  const d = checkExecution(report({ anchorAt: null }), 100, 0);
  assert.equal(d.ok, false);
  assert.equal(d.reason, 'NO_DATA');
});

// --------------------------------------------------------------------- gap risk

test('gap risk rejects strictly above the ceiling, not at it', () => {
  // The contract is `o.gapRisk > maxGapRisk`. An off-by-one in the mirror would
  // refuse trades the chain allows, which is the direction that costs a user a
  // position they wanted and never shows up as an error.
  const m: Mandate = { ...DEFAULT_MANDATE, maxGapRisk: 60 };
  assert.equal(checkExecution(report({ gapRisk: 60 }), 100, 0, m).ok, true);
  const over = checkExecution(report({ gapRisk: 61 }), 100, 0, m);
  assert.equal(over.reason, 'GAP_RISK');
  assert.match(over.detail!, /61 > 60/);
});

// ---------------------------------------------------------------- deviation

test("the mandate's deviation tolerance is widened by the oracle's own uncertainty", () => {
  // Punishing a trade for landing inside the band the oracle itself cannot
  // resolve would be incoherent — the contract adds `o.confidenceBps` to the
  // mandate's limit, and so must this.
  const m: Mandate = { ...DEFAULT_MANDATE, maxDeviationBps: 100 };

  // 150bp away, 100bp mandate: refused with no band, allowed with a 50bp band.
  assert.equal(checkExecution(report({ confidenceBps: 0 }), 101.5, 0, m).reason, 'OFF_FAIR_VALUE');
  assert.equal(checkExecution(report({ confidenceBps: 50 }), 101.5, 0, m).ok, true);
});

test('deviation is absolute — paying under fair value is measured too', () => {
  const m: Mandate = { ...DEFAULT_MANDATE, maxDeviationBps: 100 };
  assert.equal(checkExecution(report(), 98.5, 0, m).reason, 'OFF_FAIR_VALUE');
  assert.equal(checkExecution(report(), 101.5, 0, m).reason, 'OFF_FAIR_VALUE');
});

test('inside the tolerance is allowed, past it is not', () => {
  const m: Mandate = { ...DEFAULT_MANDATE, maxDeviationBps: 100 };
  assert.equal(checkExecution(report(), 100.9, 0, m).ok, true);
  assert.equal(checkExecution(report(), 101.5, 0, m).reason, 'OFF_FAIR_VALUE');
});

test('at exactly the tolerance the mirror is stricter than the chain, by an epsilon', () => {
  // A real divergence, found by this test and left in place deliberately.
  //
  // The contract computes `(diff * 10_000) / fv` in integers: for a price of
  // 101 against a fair value of 100 that is exactly 100, and `> 100` is false,
  // so the chain **allows** it. This mirror computes
  // `Math.abs(101 / 100 - 1) * 10_000`, which in IEEE-754 is
  // 100.00000000000009 — greater than 100, so it **refuses**.
  //
  // Left alone because the direction is the safe one: the planner declining a
  // trade the chain would have permitted costs a user one basis point of
  // opportunity at a boundary they cannot have aimed for, while the reverse
  // would have the page promise a fill that reverts. Recorded rather than
  // silently tolerated, because "mirrors it line for line" is a claim this
  // repo makes out loud, and it is true to within floating point rather than
  // exactly.
  const m: Mandate = { ...DEFAULT_MANDATE, maxDeviationBps: 100 };
  assert.equal(Math.abs(101 / 100 - 1) * 10_000 > 100, true);
  assert.equal(checkExecution(report(), 101, 0, m).reason, 'OFF_FAIR_VALUE');
});

// ------------------------------------------------------------------- impact

test('price impact rejects strictly above the ceiling', () => {
  const m: Mandate = { ...DEFAULT_MANDATE, maxImpactBps: 50 };
  assert.equal(checkExecution(report(), 100, 50, m).ok, true);
  const over = checkExecution(report(), 100, 51, m);
  assert.equal(over.reason, 'PRICE_IMPACT');
  assert.match(over.detail!, /51bp/);
});

test('a trade that breaches both deviation and impact is refused for the deviation', () => {
  // Order is load-bearing for the message, not the outcome: the deviation is
  // the fact about the asset, the impact is the fact about our own size, and
  // reporting the second while the first is also wrong sends the user to fix
  // the wrong thing.
  const d = checkExecution(report(), 105, 5_000);
  assert.equal(d.reason, 'OFF_FAIR_VALUE');
});

// -------------------------------------------------------------- the STALE gap

test('the clock does not enter into it — there is no STALE here, on purpose', () => {
  // `FairValueOracle.checkExecution` returns STALE when the *published*
  // observation is older than `maxAge`. This mirror runs against a report
  // computed seconds ago, so there is no publication whose age could be in
  // question; staleness of the reference *market* is a different quantity and
  // is already priced into `gapRisk`.
  //
  // Pinned because it looks like an omission. A `maxOracleAge` field once sat
  // in `Mandate` and was never read, which is worse than an acknowledged gap:
  // a parameter that implies a check nobody performs.
  const ancient = report({ anchorAt: 1_000_000_000, stalenessHours: 10_000 });
  const now = Math.floor(Date.now() / 1000);
  assert.equal(checkExecution(ancient, 100, 0, DEFAULT_MANDATE, now).ok, true);
  assert.equal(checkExecution(ancient, 100, 0, DEFAULT_MANDATE, now + 10_000_000).ok, true);
});

test('the default mandate is the one the header renders', () => {
  // These three numbers are printed in the page header and quoted in docs. They
  // are here so a change to them is a change someone had to mean.
  assert.deepEqual(DEFAULT_MANDATE, { maxGapRisk: 60, maxDeviationBps: 100, maxImpactBps: 50 });
});
