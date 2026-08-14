/**
 * The second opinion, and the two ways it could be worse than nothing.
 *
 * A cross-check that refuses real prices is worse than none — it withholds the
 * number a user needs on exactly the day the market moves. A cross-check that
 * reports `ok` when it could not run is worse still, because it invites a reader
 * to believe something was verified. Both directions are pinned here, and the
 * second one has more tests than the first.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  crossCheck,
  HISTORY_MAX_AGE_SECONDS,
  MAX_PLAUSIBLE_SPREAD_BPS,
  MAX_POOL_DIVERGENCE_BPS,
  STEP_FLOOR,
  type CrossCheckInput,
} from './crosscheck';

/** A perfectly ordinary asset: everything agrees, nothing is missing. */
function input(over: Partial<CrossCheckInput> = {}): CrossCheckInput {
  return {
    symbol: 'wNVDAx',
    fairValue: 223.21,
    quote: { bid: 223.0, ask: 223.42, mid: 223.21, spreadBps: 19 },
    previous: { mid: 222.8, ageSeconds: 600 },
    overnightSd: 0.0187,
    onchainPrice: 224.1,
    ...over,
  };
}

const verdictOf = (r: ReturnType<typeof crossCheck>, name: string) =>
  r.checks.find((c) => c.name === name)!.verdict;

test('an ordinary asset passes all four, and nothing is withheld', () => {
  const r = crossCheck(input());
  assert.equal(r.publishable, true);
  assert.deepEqual(r.reasons, []);
  assert.equal(r.checks.filter((c) => c.verdict === 'ok').length, 4);
});

// -------------------------------------------------- what it is here to catch

test('a bid of zero is refused — that is a broken feed, not a cheap market', () => {
  const r = crossCheck(input({ quote: { bid: 0, ask: 223.42, mid: 223.21, spreadBps: 19 } }));
  assert.equal(r.publishable, false);
  assert.equal(verdictOf(r, 'quote-coherence'), 'failed');
});

test('a mid outside its own bid and ask is refused', () => {
  // The shape a units error takes: the mid arrives in cents and the sides do
  // not, or one field is another asset's. Cheap to check, and it is the
  // arithmetic the issuer's own quote has to satisfy.
  const r = crossCheck(input({ quote: { bid: 223.0, ask: 223.42, mid: 22_321, spreadBps: 19 } }));
  assert.equal(verdictOf(r, 'quote-coherence'), 'failed');
});

test('a spread nobody would trade in is refused, and a wide real one is not', () => {
  const broken = crossCheck(
    input({ quote: { bid: 100, ask: 180, mid: 140, spreadBps: MAX_PLAUSIBLE_SPREAD_BPS + 1 } }),
  );
  assert.equal(verdictOf(broken, 'spread-plausibility'), 'failed');

  // 853bp is the widest open-gap band this repo has ever recorded (wSNDKx). A
  // spread that wide is unusual and real, and refusing it would withhold a price
  // from the user who most needs one.
  const wide = crossCheck(input({ quote: { bid: 100, ask: 108.9, mid: 104.45, spreadBps: 853 } }));
  assert.equal(verdictOf(wide, 'spread-plausibility'), 'ok');
});

test('a mid that jumped past 8σ of its own measured volatility is refused', () => {
  // The case the on-chain bound cannot catch: it caps the rate of change and
  // **re-anchors freely once publishing has lapsed a day**, which is the state a
  // manually-run publisher is in most of the time. This one compares against our
  // own store instead.
  const r = crossCheck(input({ previous: { mid: 222.8, ageSeconds: 600 }, quote: { bid: 445, ask: 447, mid: 446, spreadBps: 19 } }));
  assert.equal(r.publishable, false);
  assert.equal(verdictOf(r, 'step-vs-history'), 'failed');
  assert.match(r.reasons[0]!, /100\.2% from our last recorded mark/);
});

test('the chain and the value disagreeing by more than half refuses both', () => {
  // Bracketed by the admission test (D38): the widest admitted basis was 2.0%,
  // the narrowest rejected one 86.4% — a currency error. This catches the second
  // kind and cannot reach the first.
  const r = crossCheck(input({ fairValue: 223.21, onchainPrice: 0.17 }));
  assert.equal(verdictOf(r, 'pool-divergence'), 'failed');
  assert.equal(r.publishable, false);
});

// ------------------------------------------- what it must never do: overreach

test('a real move inside the asset’s own volatility is not a defect', () => {
  // 8σ on wNVDAx's measured 1.87% is 15%, and the floor lifts it to 20%. A 12%
  // day is a real day.
  const r = crossCheck(input({ previous: { mid: 200, ageSeconds: 3_600 }, quote: { bid: 223, ask: 223.4, mid: 224, spreadBps: 19 } }));
  assert.equal(verdictOf(r, 'step-vs-history'), 'ok');
});

test('the quietest assets get the floor, not 8σ of almost nothing', () => {
  // wAAPLx's σ is 0.925%, so 8σ is 7.4% — a number a real Monday can produce.
  // Without the floor this check would refuse ordinary prices on exactly the
  // assets whose prices are least often wrong.
  const quiet = { ...input(), overnightSd: 0.00925, previous: { mid: 100, ageSeconds: 600 } };
  const withinFloor = crossCheck({
    ...quiet,
    quote: { bid: 114, ask: 116, mid: 115, spreadBps: 19 },
  });
  assert.equal(verdictOf(withinFloor, 'step-vs-history'), 'ok', '15% is inside the 20% floor');
  assert.equal(STEP_FLOOR, 0.2);

  const past = crossCheck({ ...quiet, quote: { bid: 124, ask: 126, mid: 125, spreadBps: 19 } });
  assert.equal(verdictOf(past, 'step-vs-history'), 'failed');
});

test('a thin pool drifting a few per cent is never called an error', () => {
  for (const price of [223.21 * 1.02, 223.21 * 0.9, 223.21 * 1.4]) {
    const r = crossCheck(input({ onchainPrice: price }));
    assert.equal(verdictOf(r, 'pool-divergence'), 'ok', `${price} was refused`);
  }
  assert.equal(MAX_POOL_DIVERGENCE_BPS, 5_000);
});

// -------------------------------- a check that cannot run has not passed

test('missing evidence skips, and a skip is not an ok', () => {
  // The whole store held 60 samples on the day this was written — two per asset,
  // one session — so most assets have nothing to compare against. Reporting that
  // as `ok` would claim a verification that did not happen (D63's rule, applied
  // to a check instead of to a σ).
  const r = crossCheck(input({ previous: null, onchainPrice: null }));
  assert.equal(verdictOf(r, 'step-vs-history'), 'skipped');
  assert.equal(verdictOf(r, 'pool-divergence'), 'skipped');
  assert.equal(r.publishable, true, 'a skip must not withhold a value');
});

test('a stale previous mark is skipped rather than compared', () => {
  // Past two days a large move is ordinary, and comparing against it would be
  // refusing normal price discovery rather than catching a fault.
  const r = crossCheck(
    input({
      previous: { mid: 100, ageSeconds: HISTORY_MAX_AGE_SECONDS + 1 },
      quote: { bid: 222, ask: 224, mid: 223.21, spreadBps: 19 },
    }),
  );
  assert.equal(verdictOf(r, 'step-vs-history'), 'skipped');
  assert.match(r.checks.find((c) => c.name === 'step-vs-history')!.detail, /too old/);
});

test('an asset with no measured σ is skipped, not judged against a guess', () => {
  const r = crossCheck(input({ overnightSd: null }));
  assert.equal(verdictOf(r, 'step-vs-history'), 'skipped');
});

test('a value already withheld upstream skips the pool check instead of dividing by it', () => {
  const r = crossCheck(input({ fairValue: null }));
  assert.equal(verdictOf(r, 'pool-divergence'), 'skipped');
});

test('every failure carries its numbers, because the reason is the product', () => {
  const r = crossCheck(input({ quote: { bid: 0, ask: 0, mid: 0, spreadBps: 99_999 } }));
  assert.ok(r.reasons.length >= 2);
  for (const reason of r.reasons) {
    assert.match(reason, /\d/, `"${reason}" states no number`);
  }
});
