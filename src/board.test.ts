/**
 * What the board counts, and what it refuses to count.
 *
 * The first run of `pnpm board` wrote nine live markets down as capacity `0`,
 * verdict `NO_DATA`, indistinguishable from a token nobody has ever pooled.
 * Probing the chain settled what was actually true — the pools existed and held
 * nothing — but the lesson was in the shape rather than the cause: one zero was
 * standing in for three different facts, and one of them was "we do not know".
 *
 * So these pin the judgement rather than the arithmetic. A summary that folds an
 * unreadable asset in as zero is a failure presented as a thin market, and that
 * is the sentence this whole product is built against.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { median, summarise, type Board, type BoardAsset } from './board';
import { parseBoard, publishableCount, shouldWithhold } from './board-store';

const LIMITS = [50, 500] as const;

function asset(
  symbol: string,
  depth: BoardAsset['depth'],
  capacity: Record<number, number | null>,
): BoardAsset {
  return {
    symbol,
    address: '0x0000000000000000000000000000000000000000',
    fairValue: 100,
    publishable: true,
    confidenceBps: 30,
    reference: 'issuer',
    state: 'REGULAR' as BoardAsset['state'],
    sharesPerToken: 1,
    gapRisk: 10,
    gapRiskParts: { staleness: 0, displacement: 0, uncertainty: 0, basis: 0 },
    notes: [],
    onchainPrice: 100,
    basisBps: 0,
    depth,
    poolCount: depth === 'no-pool' ? 0 : 1,
    venueCount: depth === 'ok' ? 1 : 0,
    capacityUsdg: capacity,
    ladder: [],
  };
}

const tradable = (symbol: string, at50: number) =>
  asset(symbol, 'ok', { 50: at50, 500: at50 * 4 });

test('median takes the middle of an odd count', () => {
  assert.equal(median([3, 1, 2]), 2);
});

test('median averages the middle two of an even count', () => {
  assert.equal(median([4, 1, 3, 2]), 2.5);
});

test('median of nothing is zero rather than NaN', () => {
  assert.equal(median([]), 0);
});

test('a dry pool counts as zero, because zero is what it can absorb', () => {
  const totals = summarise(
    [tradable('wSPYx', 1000), asset('wQQQx', 'no-liquidity', { 50: 0, 500: 0 })],
    LIMITS,
  );

  assert.equal(totals.capacityUsdg[50], 1000);
  // Two assets, one at 1000 and one at 0 — the middle is the mean of both.
  assert.equal(totals.medianUsdg[50], 500);
  assert.deepEqual(totals.dry, ['wQQQx']);
  assert.deepEqual(totals.unmeasured, []);
});

test('an asset with no pool at all is dry, not unmeasured', () => {
  const totals = summarise([asset('wNEWx', 'no-pool', { 50: 0, 500: 0 })], LIMITS);

  assert.deepEqual(totals.dry, ['wNEWx']);
  assert.deepEqual(totals.unmeasured, []);
});

test('an unreadable asset is excluded rather than counted as zero', () => {
  const priced = [tradable('wSPYx', 1000), tradable('wNVDAx', 3000)];
  const withFailure = [...priced, asset('wMUx', 'unreadable', { 50: null, 500: null })];

  const clean = summarise(priced, LIMITS);
  const degraded = summarise(withFailure, LIMITS);

  // The read that missed changes neither the total nor the middle. Folding it
  // in as zero would have dragged the median from 2000 to 1000 and reported a
  // market half as deep as the one that was measured.
  assert.equal(degraded.capacityUsdg[50], clean.capacityUsdg[50]);
  assert.equal(degraded.medianUsdg[50], clean.medianUsdg[50]);
  assert.equal(degraded.medianUsdg[50], 2000);

  // Excluded from the sums, named in the summary. Never silently dropped.
  assert.deepEqual(degraded.unmeasured, ['wMUx']);
});

test('the largest asset carries its share, so the total is never read alone', () => {
  const totals = summarise([tradable('wTSLAx', 7000), tradable('wSPYx', 3000)], LIMITS);

  assert.equal(totals.largest?.symbol, 'wTSLAx');
  assert.equal(totals.largest?.usdg, 7000);
  assert.equal(totals.largest?.shareOfTotal, 0.7);
});

test('nothing tradable means no largest, rather than a share of zero', () => {
  const totals = summarise([asset('wQQQx', 'no-liquidity', { 50: 0, 500: 0 })], LIMITS);

  assert.equal(totals.largest, null);
  assert.equal(totals.capacityUsdg[50], 0);
});

test('every limit is summarised, not just the mandate’s own', () => {
  const totals = summarise([tradable('wSPYx', 1000)], LIMITS);

  assert.equal(totals.capacityUsdg[50], 1000);
  assert.equal(totals.capacityUsdg[500], 4000);
});

test('a board with no timestamp is refused rather than rendered undated', () => {
  assert.equal(parseBoard({ assets: [] }), null);
  assert.equal(parseBoard({ measuredAt: 1, assets: 'not an array' }), null);
  assert.equal(parseBoard(null), null);
  assert.equal(parseBoard('{}'), null);
});

test('a board with a timestamp and assets is accepted', () => {
  const board = { measuredAt: 1_786_973_235, assets: [] };
  assert.equal(parseBoard(board), board);
});

/*
 * A board that prices nothing must not displace one that priced something.
 *
 * Measured on 2026-08-17: both issuer hosts answered 502, `computeFairValue`
 * correctly withheld all thirty values, and the resulting board overwrote an
 * hour-old one that had all thirty. The walk still succeeded — real pool depth,
 * thirty assets — so nothing downstream could tell the difference. What was
 * lost was information, replaced by the absence of it.
 */
const board = (measuredAt: number, priced: number, total: number): Board => ({
  measuredAt,
  chainId: 196,
  mandate: { maxGapRisk: 60, maxDeviationBps: 100, maxImpactBps: 50 },
  capacityLimitsBps: [...LIMITS],
  ladderUsdg: [250],
  assets: Array.from({ length: total }, (_, i) => ({
    ...tradable(`w${i}x`, 1000),
    publishable: i < priced,
    fairValue: i < priced ? 100 : null,
  })),
  totals: summarise([], LIMITS),
});

test('a board that prices nothing does not displace one that priced something', () => {
  assert.equal(shouldWithhold(board(2, 0, 30), board(1, 30, 30)), true);
});

test('an empty archive is still worse than a board with no prices', () => {
  // Nothing to protect, so the write goes ahead: a board with real depth and no
  // values beats a page that has never seen a board at all.
  assert.equal(shouldWithhold(board(2, 0, 30), null), false);
});

test('a board that prices nothing yields to nothing better than itself', () => {
  assert.equal(shouldWithhold(board(2, 0, 30), board(1, 0, 30)), false);
});

test('a board carrying prices always writes, whatever the archive holds', () => {
  assert.equal(shouldWithhold(board(2, 1, 30), board(1, 30, 30)), false);
  assert.equal(shouldWithhold(board(2, 30, 30), board(1, 30, 30)), false);
});

test('publishableCount counts values, not assets', () => {
  assert.equal(publishableCount(board(1, 7, 30)), 7);
  assert.equal(publishableCount(board(1, 0, 30)), 0);
});
