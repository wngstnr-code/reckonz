/**
 * Unit tests for the execution planner, over hand-built synthetic venues.
 *
 * `loadVenues` / `planBasket` touch the network and are out of scope here —
 * everything below exercises `quote`, `bestQuote`, `capacity` and `schedule`,
 * which are pure once a `Venue` exists. Fixture pools sit at tick 0 (or 6000)
 * with a flat, un-initialized tick bitmap window (no crossings), which makes
 * `simulateExactInput` collapse to exactly one `computeSwapStep` call — that
 * lets these tests derive "expected" output from `v3math` directly instead of
 * hand-computing V3 arithmetic, while still exercising the real planner code
 * (pool.ts's multi-tick walker, decimals conversion, fee wiring) end to end.
 *
 * No network, no filesystem — every venue below is constructed in memory.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PoolSnapshot } from './pool';
import { getSqrtRatioAtTick, computeSwapStep, getAmount0Delta } from './v3math';
import {
  quote,
  bestQuote,
  capacity,
  schedule,
  planningLimitBps,
  PLAN_HEADROOM,
  type Venue,
} from './planner';

const USDG_DECIMALS = 6; // matches USDG.decimals in chain.ts
const unit = 10n ** BigInt(USDG_DECIMALS);

/**
 * Builds a USDG/ASSET pool with constant liquidity and a flat tick bitmap
 * (no initialized ticks) across `[-wordRange, wordRange]` words. Both tokens
 * use 6 decimals so amounts are easy to reason about by eye. USDG is always
 * token0, so buying the asset is a zeroForOne=true swap.
 */
function makeVenue(
  liquidity: bigint,
  wordRange: number,
  fee = 3000,
  tick = 0,
): Venue {
  const tickSpacing = 60;
  const words = new Map<number, bigint>();
  for (let w = -wordRange; w <= wordRange; w++) words.set(w, 0n);

  const pool: PoolSnapshot = {
    address: '0x0000000000000000000000000000000000000001',
    token0: { address: '0x0000000000000000000000000000000000000002', symbol: 'USDG', decimals: USDG_DECIMALS },
    token1: { address: '0x0000000000000000000000000000000000000003', symbol: 'TEST', decimals: USDG_DECIMALS },
    fee,
    tickSpacing,
    sqrtPriceX96: getSqrtRatioAtTick(tick),
    tick,
    liquidity,
    words,
    ticks: new Map(),
    blockNumber: 0n,
  };

  return { pool, usdgIsToken0: true, asset: pool.token1, spot: 1 };
}

// -------------------------------------------------------------------- quote

test('quote wires the multi-tick simulation into effective price and impact bps', () => {
  // tick=6000, spacing=60: within-word search resolves the swap's price
  // target to tick 0 exactly (verified against nextInitializedTickWithinOneWord
  // directly — see the brief's prototype). Only word 0 is prefetched, which is
  // enough because the trade below does not reach that boundary.
  const venue = makeVenue(10n ** 24n, 0, 3000, 6000);
  const usdgAmount = 1_000n * unit;

  const expectedStep = computeSwapStep(
    venue.pool.sqrtPriceX96,
    getSqrtRatioAtTick(0),
    venue.pool.liquidity,
    usdgAmount,
    venue.pool.fee,
  );

  const q = quote(venue, usdgAmount);

  assert.equal(q.result.amountOut, expectedStep.amountOut);
  assert.equal(q.result.exhaustedWindow, false);
  assert.equal(q.out, Number(expectedStep.amountOut) / 10 ** USDG_DECIMALS);
  assert.equal(q.effectivePrice, 1000 / q.out);
  // impactBps is simply passed through from the simulation, not recomputed —
  // pin that wiring rather than re-deriving the formula pool.ts already owns.
  assert.equal(q.impactBps, q.result.priceImpactBps);
  // The trade moves price against the buyer, so impact must be strictly positive.
  assert.ok(q.impactBps > 0);
});

test('quote of a zero size reports zero output and an infinite effective price', () => {
  const venue = makeVenue(10n ** 24n, 0, 3000, 6000);
  const q = quote(venue, 0n);
  assert.equal(q.out, 0);
  assert.equal(q.effectivePrice, Infinity);
});

test('quote flags exhaustedWindow when the trade needs ticks beyond the prefetched bitmap', () => {
  // Only word 0 is prefetched. A trade large enough to fully cross the word's
  // tick range and need the next (missing) word must come back marked as an
  // unprovable, understated lower bound — never a silently truncated number.
  const venue = makeVenue(10n ** 15n, 0, 3000, 0);
  const q = quote(venue, 10n ** 30n);
  assert.equal(q.result.exhaustedWindow, true);
});

// ---------------------------------------------------------------- bestQuote

test('bestQuote returns null when no venue can quote', () => {
  assert.equal(bestQuote([], 1_000n * unit), null);
  // A size of zero yields amountOut=0 everywhere, which quote()/bestQuote()
  // filters out entirely (q.out > 0), so this is also a "nothing quotes" case.
  const venue = makeVenue(10n ** 24n, 0, 3000, 6000);
  assert.equal(bestQuote([venue], 0n), null);
});

test('bestQuote picks the venue with the most output, not the lowest fee tier', () => {
  // Shallow liquidity + the lowest fee tier still loses on output once its
  // price impact swamps the fee saving — bestQuote must not be a proxy for
  // "cheapest fee", it has to actually run both simulations and compare.
  const shallowLowFee = makeVenue(10n ** 11n, 30, 500);
  const deepHighFee = makeVenue(10n ** 24n, 30, 10000);
  const size = 500_000n * unit;

  const shallow = quote(shallowLowFee, size);
  const deep = quote(deepHighFee, size);
  assert.ok(
    deep.out > shallow.out,
    'fixture invariant broken: deep/high-fee venue should out-quote shallow/low-fee at this size',
  );

  const best = bestQuote([shallowLowFee, deepHighFee], size);
  assert.equal(best?.venue.pool.fee, 10000);
  assert.equal(best?.out, deep.out);
});

// ----------------------------------------------------------------- capacity

test('capacity is zero when there are no venues to quote', () => {
  assert.equal(capacity([], 50), 0n);
});

test('D34: a pool whose true capacity exceeds the prefetched tick window must not report the window edge as a measurement', () => {
  // Deep, genuinely low-impact pool (31bps at 100k USDG) — but only word 0 is
  // prefetched, and 100k USDG already needs ticks beyond it. Every quote in
  // that regime comes back exhaustedWindow=true, which capacity() must treat
  // as "cannot defend this number" (Infinity), not as a passing measurement.
  const venue = makeVenue(10n ** 15n, 0, 3000, 0);

  const probe = quote(venue, 100_000n * unit);
  assert.equal(probe.result.exhaustedWindow, true);
  assert.ok(probe.impactBps < 50, 'fixture invariant: the true impact here is well under the limit');

  // Despite that, capacity must refuse to certify any size in this venue —
  // it has no size it can measure without hitting the window edge.
  assert.equal(capacity([venue], 50), 0n);
});

test('capacity search is not capped at the old fixed 1,000,000 USDG guess (D34 regression)', () => {
  // Deep pool, wide prefetched window (no exhaustedWindow anywhere sane).
  // True capacity at 50bps is far past 1,000,000 USDG; capacity() must keep
  // doubling its search ceiling rather than returning the first guess that
  // happened to pass.
  const venue = makeVenue(10n ** 22n, 20, 3000);
  const maxBps = 50;

  const cap = capacity([venue], maxBps);
  assert.ok(cap > 1_000_000n * unit, `capacity ${cap} did not exceed the old fixed search ceiling`);

  const atCap = quote(venue, cap);
  assert.equal(atCap.result.exhaustedWindow, false);
  assert.ok(atCap.impactBps <= maxBps);

  const beyondCap = quote(venue, cap + cap / 10n);
  assert.ok(beyondCap.impactBps > maxBps, 'a size clearly past capacity must breach the impact limit');
});

// ------------------------------------------------------------ plan headroom

test('sizing straight to the guard limit lands on the boundary (the D86 defect)', () => {
  // Not a fix, a demonstration: this is what the planner used to hand the
  // guard. `capacity()` is correct here — it is asked for the largest size
  // inside 50bp and returns exactly that — but a size whose measured impact IS
  // the limit has no room left for the pool to move between being sized and
  // being judged, and the guard rejects on `>`.
  const venue = makeVenue(10n ** 15n, 30, 3000);
  const guardBps = 50;

  const atGuardLimit = quote(venue, capacity([venue], guardBps));
  assert.equal(atGuardLimit.impactBps, guardBps);
});

test('planningLimitBps leaves the sized order real room under the guard', () => {
  const venue = makeVenue(10n ** 15n, 30, 3000);
  const guardBps = 50;
  const planBps = planningLimitBps(guardBps);

  assert.equal(planBps, guardBps * PLAN_HEADROOM);
  assert.ok(planBps < guardBps);

  const planned = capacity([venue], planBps);
  const atPlanLimit = quote(venue, planned);

  // Inside the limit it was sized to...
  assert.ok(
    atPlanLimit.impactBps <= planBps,
    `sized order measured ${atPlanLimit.impactBps}bp against a ${planBps}bp planning limit`,
  );
  // ...and therefore strictly inside the one the guard enforces, by a margin
  // the pool has to move through before the verdict flips.
  assert.ok(guardBps - atPlanLimit.impactBps >= 5);

  // The headroom costs size rather than being free, which is the trade this
  // makes explicit: a capacity-limited leg is deliberately smaller now.
  assert.ok(planned < capacity([venue], guardBps));
});

// ----------------------------------------------------------------- schedule

test('schedule does not slice when the requested size already fits within capacity', () => {
  const venue = makeVenue(10n ** 22n, 20, 3000);
  const maxBps = 50;
  const total = 100_000n * unit; // far under this venue's multi-million-USDG capacity

  const single = bestQuote([venue], total)!;
  const sched = schedule([venue], total, maxBps);

  assert.equal(sched.slices, 1);
  assert.equal(sched.perSlice, total);
  assert.equal(sched.expectedImpactBps, single.impactBps);
  assert.equal(sched.singleShotImpactBps, single.impactBps);
});

test('schedule slices a size above capacity, and each slice individually respects the impact limit', () => {
  const venue = makeVenue(10n ** 15n, 30, 3000);
  const maxBps = 50;
  const cap = capacity([venue], maxBps);
  const total = 5_000_000n * unit;
  assert.ok(total > cap, 'test setup: total must exceed capacity to force slicing');

  const sched = schedule([venue], total, maxBps);
  assert.ok(sched.slices > 1);

  const sliceQuote = quote(venue, sched.perSlice);
  assert.ok(
    sliceQuote.impactBps <= maxBps,
    `single slice of ${sched.perSlice} breached the impact limit: ${sliceQuote.impactBps}bps`,
  );
});

test('the slices add up to exactly the order they are a plan for', () => {
  // Found by this test and fixed. `perSlice = total / BigInt(slices)` is a floor
  // division, and the `Schedule` shape had nowhere to put the remainder: at
  // total 5,000,000 USDG over 3 slices it planned 3 × 1,666,666.666666 and
  // deleted two base units in silence.
  //
  // Two USDG-millionths is economically nothing. The objection is that this
  // repo's rule is chain precision throughout and a plan that does not add up
  // to its own order is the same class of mistake as D29's per-leg sizing —
  // and that nothing was checking, which is why it survived.
  const venue = makeVenue(10n ** 15n, 30, 3000);
  const total = 5_000_000n * unit;

  const sched = schedule([venue], total, 50);
  assert.ok(sched.slices > 1, 'fixture must actually slice for this to mean anything');

  const reconstructed = sched.perSlice * BigInt(sched.slices - 1) + sched.lastSlice;
  assert.equal(reconstructed, total);

  // The last slice absorbs the remainder, so it is never smaller than the rest
  // and never larger by more than the number of slices.
  assert.ok(sched.lastSlice >= sched.perSlice);
  assert.ok(sched.lastSlice - sched.perSlice < BigInt(sched.slices));
});

test('a single-slice schedule is the whole order, both fields agreeing', () => {
  // The unsliced path returns `total` twice. A caller that always executes
  // `slices - 1` at `perSlice` then `lastSlice` must deploy exactly `total`
  // here too, without a special case for one.
  const venue = makeVenue(10n ** 18n, 30, 3000);
  const total = 1n * unit;

  const sched = schedule([venue], total, 50);
  assert.equal(sched.slices, 1);
  assert.equal(sched.perSlice, total);
  assert.equal(sched.lastSlice, total);
  assert.equal(sched.perSlice * BigInt(sched.slices - 1) + sched.lastSlice, total);
});
