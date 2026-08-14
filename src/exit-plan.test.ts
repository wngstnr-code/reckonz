/**
 * `exitShortfallBps` — the mirror of `Executor._exitShortfallBps`.
 *
 * This is the function D68 was about. The old inline copy in `src/exit.ts`
 * measured against `peek`, which hands back a stale value with `hasValue` still
 * true; the contract reads through `observation`, which **reverts** on `Stale`
 * and `NoData`, and catches it — returning zero. Measured against a value the
 * oracle has stopped defending, in a market that has since moved, the shortfall
 * is enormous and false, and `maxSlippageBps` then blocks the exit.
 *
 * Refusing an exit is the one failure this system is least allowed to have, so
 * the stale case is pinned here first and hardest.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exitShortfallBps } from './exit-plan';
import { shortfallBps } from './fill';

const FAIR = 100_00_000_000n; // 100.00000000

// ------------------------------------------------- the case that cost D68

test('a stale oracle yields zero, not a large shortfall', () => {
  // Sold at half of a fair value the oracle has stopped defending. Measured, it
  // would be 5,000 bps and every mandate on earth would refuse the exit. The
  // contract catches its own `Stale` revert and returns 0; so does this.
  assert.equal(exitShortfallBps(50_00_000_000n, FAIR, true, true), 0);
});

test('an oracle with no publishable value yields zero for the same reason', () => {
  assert.equal(exitShortfallBps(50_00_000_000n, FAIR, false, false), 0);
  assert.equal(exitShortfallBps(50_00_000_000n, 0n, true, false), 0);
});

test('receipt #16 on mainnet recorded slippageBps 0 with the oracle 43 hours stale', () => {
  // The real inputs from ReceiptRegistry id 16, tx 0x85501e91…: the chain wrote
  // `slippageBps: 0` and `fairValueE8: 0`. This is the assertion that the
  // off-chain mirror predicted what the contract actually did — checked against
  // the chain rather than against a careful reading of it.
  assert.equal(exitShortfallBps(33_992_200_000n, 33_413_508_500n, true, true), 0);
});

// ------------------------------------------------------- the live measurement

test('selling below fair value is a shortfall, measured downward', () => {
  // Inverted against the entry path deliberately: selling badly means receiving
  // less, and the entry comparison would report zero for every sale under fair
  // value.
  assert.equal(exitShortfallBps(99_00_000_000n, FAIR, true, false), 100);
  assert.equal(exitShortfallBps(90_00_000_000n, FAIR, true, false), 1_000);
});

test('selling at or above fair value is not a shortfall', () => {
  assert.equal(exitShortfallBps(FAIR, FAIR, true, false), 0);
  assert.equal(exitShortfallBps(101_00_000_000n, FAIR, true, false), 0);
});

test('the entry and exit measurements are mirror images, and never both fire', () => {
  // The property that makes two functions correct rather than one function with
  // a flag: for any price, at most one of them is non-zero, and which one says
  // which side of fair value the trade landed on.
  for (const price of [50_00_000_000n, 99_00_000_000n, FAIR, 101_00_000_000n, 200_00_000_000n]) {
    const entry = shortfallBps(price, FAIR, true);
    const exitSide = exitShortfallBps(price, FAIR, true, false);
    assert.ok(entry === 0 || exitSide === 0, `both fired at ${price}`);
    if (price > FAIR) assert.ok(entry > 0 && exitSide === 0);
    if (price < FAIR) assert.ok(exitSide > 0 && entry === 0);
  }
});

// ------------------------------------------------------------------ the bound

test('the measurement cannot exceed 10,000 bps, which is what the uint16 relies on', () => {
  // `_exitShortfallBps` clamps at `type(uint16).max` before casting. That clamp
  // is unreachable — the largest possible shortfall is a sale at zero, which is
  // 10,000 bps — and it is correct to keep, because "explicit casts are
  // unchecked in Solidity" and bounding before the cast is the rule here even
  // where it looks unreachable (D31, D36). The mirror is asserted to stay
  // inside the same envelope rather than to reproduce the dead branch.
  assert.equal(exitShortfallBps(0n, FAIR, true, false), 10_000);
  for (const price of [0n, 1n, 33n, 99_99_999_999n]) {
    const bps = exitShortfallBps(price, FAIR, true, false);
    assert.ok(bps >= 0 && bps <= 10_000, `${bps} outside the envelope at ${price}`);
  }
});

test('truncation matches integer division, not rounding', () => {
  // fair 3, price 2 -> (1 * 10_000) / 3 = 3333.33…, and the contract keeps 3333.
  assert.equal(exitShortfallBps(2n, 3n, true, false), 3_333);
});
