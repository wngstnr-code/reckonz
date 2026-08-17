/**
 * What the recording is allowed to be, and what it must never pass for.
 *
 * The console renders this as "one real idea, priced" beside a live board, and
 * a reader has no way to tell a recorded Gemini run from `thesis-fixture.ts` by
 * looking. The fixture's own header says it ignores the input text and returns
 * the same thesis every time, so rendering one as a run would be a claim this
 * repo makes nowhere else and could not defend anywhere.
 *
 * `live` is therefore checked twice: once when recording, so a bad document
 * never reaches the file, and once on read, so a file edited by hand cannot
 * reach the page either. These pin the second.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseShowcase, type Showcase } from './showcase';

const valid: Showcase = {
  recordedAt: 1_786_985_000,
  thesis: 'Stablecoin settlement volume keeps compounding onchain.',
  claim: 'Issuers and clearing exchanges capture payments margin.',
  horizonDays: 365,
  provider: 'gemini-3.6-flash (live)',
  live: true,
  notionalUsdg: 250_000,
  maxImpactBps: 50,
  lines: [
    {
      symbol: 'wCOINx',
      targetBps: 10_000,
      plannedBps: 43,
      notional: 1086.34,
      naiveImpactBps: 7140,
      plannedImpactBps: 50,
      slices: 1,
    },
  ],
  verdicts: [
    { symbol: 'wCOINx', fillSizeUsdg: 1086, impactBps: 51, ok: false, reason: 'PRICE_IMPACT' },
  ],
  invented: 0,
  totals: {
    askedUsdg: 250_000,
    placedUsdg: 1086.34,
    unallocatedUsdg: 248_913.66,
    naiveCostUsdg: 178_500,
    plannedCostUsdg: 5.43,
  },
};

test('a recording the fixture produced is refused, whatever else it carries', () => {
  // Every other field is well formed. `live` is the only thing wrong with it,
  // and it is the only thing that matters: this is a canned thesis wearing a
  // run's shape.
  assert.equal(parseShowcase({ ...valid, live: false }), null);
  assert.equal(parseShowcase({ ...valid, live: undefined }), null);
  assert.equal(parseShowcase({ ...valid, live: 'true' }), null);
});

test('a recording with no date is refused rather than rendered undated', () => {
  // Same rule as the board: a plan is a measurement, and a measurement without
  // a date cannot be judged stale.
  assert.equal(parseShowcase({ ...valid, recordedAt: undefined }), null);
  assert.equal(parseShowcase({ ...valid, recordedAt: 'yesterday' }), null);
  assert.equal(parseShowcase({ ...valid, recordedAt: Number.NaN }), null);
});

test('a recording with no thesis is refused, because the claim cannot be checked', () => {
  assert.equal(parseShowcase({ ...valid, thesis: '' }), null);
  assert.equal(parseShowcase({ ...valid, thesis: undefined }), null);
});

test('a recording missing its legs, verdicts or totals is refused', () => {
  assert.equal(parseShowcase({ ...valid, lines: undefined }), null);
  assert.equal(parseShowcase({ ...valid, verdicts: 'none' }), null);
  assert.equal(parseShowcase({ ...valid, totals: undefined }), null);
  assert.equal(parseShowcase({ ...valid, totals: { askedUsdg: 'lots' } }), null);
});

test('nothing at all is refused without throwing', () => {
  assert.equal(parseShowcase(null), null);
  assert.equal(parseShowcase(undefined), null);
  assert.equal(parseShowcase('{}'), null);
  assert.equal(parseShowcase(42), null);
});

test('a live recording with every field is accepted as it stands', () => {
  assert.equal(parseShowcase(valid), valid);
});

test('a recording that placed nothing is still valid, because that is an answer', () => {
  // The market taking none of it is a result, not a malformed document. The
  // ribbon renders it; refusing it here would hide the honest case.
  const nothingPlaced = {
    ...valid,
    lines: [],
    verdicts: [],
    totals: { ...valid.totals, placedUsdg: 0, unallocatedUsdg: 250_000, plannedCostUsdg: 0 },
  };
  assert.equal(parseShowcase(nothingPlaced), nothingPlaced);
});
