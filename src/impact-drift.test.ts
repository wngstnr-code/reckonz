/**
 * The arithmetic that would turn a store of drifts into a constant the planner
 * sizes every trade with. Pure functions only — the paired walk itself needs
 * live pools and is exercised by running `pnpm drift`, not by a fixture that
 * would only prove the fixture.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  driftCoverage,
  MIN_SAMPLES,
  mergeDrift,
  quantile,
  suggestHeadroom,
  type DriftSample,
} from './impact-drift';

const sample = (over: Partial<DriftSample> = {}): DriftSample => ({
  symbol: 'wSPYx',
  limitBps: 50,
  sizeUsdg: 1_086,
  fromBps: 50,
  toBps: 50,
  deltaBps: 0,
  gapSec: 30,
  observedAt: 1_787_000_000,
  ...over,
});

/** `n` samples with the given drifts, each at a distinct instant. */
const store = (drifts: number[], over: Partial<DriftSample> = {}): DriftSample[] =>
  drifts.map((d, i) =>
    sample({ deltaBps: d, toBps: 50 + d, observedAt: 1_787_000_000 + i, ...over }),
  );

test('quantile returns an observation, never an interpolation', () => {
  const values = [1, 2, 3, 4];
  // The p50 of four values is the second, not 2.5. Nearest-rank on purpose.
  assert.equal(quantile(values, 0.5), 2);
  assert.equal(quantile(values, 0.99), 4);
  assert.equal(quantile(values, 1), 4);
  assert.equal(quantile([7], 0.99), 7);
});

test('quantile has nothing to say about an empty series', () => {
  assert.equal(quantile([], 0.99), null);
});

test('quantile refuses a p outside (0, 1]', () => {
  assert.throws(() => quantile([1], 0), /must be in/);
  assert.throws(() => quantile([1], 1.5), /must be in/);
});

test('a headroom is withheld until the store is long enough to mean it', () => {
  const s = suggestHeadroom(store(new Array(MIN_SAMPLES - 1).fill(2)), 50);
  assert.equal(s.samples, MIN_SAMPLES - 1);
  assert.match(s.withheld ?? '', /under the 30/);
});

test('with enough samples it suggests 1 - drift / limit', () => {
  // 100 samples, the worst two of which drifted 5bp against us. Nearest-rank
  // p99 is the 99th of them, so a single outlier in a hundred is deliberately
  // *not* what sets the headroom — that is what taking a quantile rather than
  // the maximum buys.
  const drifts = [...new Array(98).fill(1), 5, 5];
  const s = suggestHeadroom(store(drifts), 50);
  assert.equal(s.withheld, null);
  assert.equal(s.driftBps, 5);
  assert.equal(s.headroom, 0.9); // 1 - 5/50 — which is what D89 chose by hand
});

test('favourable drift never licenses sizing past the limit', () => {
  // Every pool moved our way. The guard still rejects on `>`, so the most this
  // may ever suggest is spending the whole limit — never more.
  const s = suggestHeadroom(store(new Array(40).fill(-8)), 50);
  assert.equal(s.driftBps, 0);
  assert.equal(s.headroom, 1);
});

test('a violent drift is clamped rather than halving every reported size', () => {
  const s = suggestHeadroom(store(new Array(40).fill(45)), 50);
  assert.equal(s.headroom, 0.5);
});

test('samples taken against a different limit are not averaged in', () => {
  const mixed = [...store(new Array(40).fill(1)), ...store(new Array(40).fill(40), { limitBps: 500 })];
  const s = suggestHeadroom(mixed, 50);
  assert.equal(s.samples, 40);
  assert.equal(s.driftBps, 1);

  const none = suggestHeadroom(store([1]), 200);
  assert.match(none.withheld ?? '', /no samples at a 200bp limit/);
});

test('merging the same store twice changes nothing', () => {
  const a = store([1, 2, 3]);
  const once = mergeDrift([], a);
  const twice = mergeDrift(once, a);
  assert.equal(once.length, 3);
  assert.deepEqual(twice, once);
});

test('merge keeps two assets measured at the same instant', () => {
  // The dedupe key is symbol + observedAt; a pass measures every asset and two
  // of them can land in the same second.
  const merged = mergeDrift(
    [sample({ symbol: 'wSPYx', observedAt: 100 })],
    [sample({ symbol: 'wTSLAx', observedAt: 100 })],
  );
  assert.equal(merged.length, 2);
});

test('merge sorts by time so an appended store does not leave the file out of order', () => {
  const merged = mergeDrift(store([1], { observedAt: 200 }), store([2], { observedAt: 100 }));
  assert.deepEqual(
    merged.map((s) => s.observedAt),
    [100, 200],
  );
});

test('coverage ranks by the worst drift, not the sample count', () => {
  const rows = driftCoverage([
    ...store([1, 1, 1], { symbol: 'wAAPLx' }),
    ...store([9], { symbol: 'wCRCLx' }),
  ]);
  assert.equal(rows[0]!.symbol, 'wCRCLx');
  assert.equal(rows[0]!.worstBps, 9);
  assert.equal(rows[1]!.samples, 3);
});
