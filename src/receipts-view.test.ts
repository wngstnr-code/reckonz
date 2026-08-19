/**
 * The arithmetic the receipts page renders, and the one trap inside it.
 *
 * A fill nothing priced records `slippageBps: 0` and `fairValueE8: 0` — the
 * best possible number for the worst possible reason (D77). Averaging those
 * into a headline drags it towards zero using fills no oracle ever measured,
 * which is the single direction this figure must never fail in. Most of what
 * follows exists to pin that.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allReceipts, findReceipt, hasEvidence, summarise, type WireSnapshot } from './receipts-view';

const ZERO = '0x0000000000000000000000000000000000000000000000000000000000000000';

const fill = (over: Partial<{ usdg: string; slip: number; exit: boolean; fair: string }> = {}) => ({
  asset: '0xaaaa',
  symbol: 'wTEST',
  isExit: over.exit ?? false,
  amountInUsdg: over.usdg ?? '1000000',
  amountOut: '0',
  executionPriceE8: '100000000',
  slippageBps: over.slip ?? 0,
  fairValueE8: over.fair ?? '100000000',
  gapRisk: 5,
});

const receipt = (id: number, fills: ReturnType<typeof fill>[], evidence = '0xbeef') => ({
  id,
  mandateId: '1',
  policyVersion: 2,
  agent: '0xagent',
  thesisHash: ZERO,
  evidenceHash: evidence,
  timestamp: 1_700_000_000 + id,
  blockNumber: String(1000 + id),
  fills,
});

const snapshot = (over: Partial<WireSnapshot> = {}): WireSnapshot => ({
  chainId: 196,
  theses: [],
  unattributed: [],
  orphanedHashes: [],
  ...over,
});

test('every receipt appears once, newest first, whether or not it has a thesis', () => {
  const wire = snapshot({
    theses: [
      {
        id: 0,
        author: '0xauthor',
        contentHash: '0xc0',
        publishedAt: 1_600_000_000,
        blockNumber: '900',
        cid: '',
        receipts: [receipt(2, [fill()])],
        basket: [],
        record: {
          fillCount: 1,
          entryCount: 1,
          exitCount: 0,
          notionalUsdg: '1000000',
          weightedSlippageBps: 0,
          worstSlippageBps: 0,
          firstFillAt: null,
          lastFillAt: null,
        },
        publishedBeforeExecution: true,
      },
    ],
    unattributed: [receipt(5, [fill()]), receipt(1, [fill()])],
  });

  const all = allReceipts(wire);
  assert.deepEqual(
    all.map((r) => r.id),
    [5, 2, 1],
  );
  assert.equal(all.find((r) => r.id === 2)?.thesisId, 0);
  assert.equal(all.find((r) => r.id === 5)?.thesisId, null);
});

test('an unmeasured exit is left out of the weighted average, not counted as zero', () => {
  // One good fill at 40bps, and one exit ten times its size that nothing
  // priced. Folding the second in at zero would report ~4bps.
  const wire = snapshot({
    unattributed: [
      receipt(1, [fill({ usdg: '1000000', slip: 40 })]),
      receipt(2, [fill({ usdg: '10000000', slip: 0, exit: true, fair: '0' })]),
    ],
  });

  const s = summarise(wire);
  assert.equal(s.weightedSlippageBps, 40);
  assert.equal(s.measuredFills, 1);
  assert.equal(s.unmeasuredFills, 1);
});

test('nothing measurable reports null rather than zero', () => {
  const wire = snapshot({
    unattributed: [receipt(1, [fill({ slip: 0, exit: true, fair: '0' })])],
  });
  assert.equal(summarise(wire).weightedSlippageBps, null);
});

test('notional covers entries only, so an exit does not inflate what was deployed', () => {
  const wire = snapshot({
    unattributed: [
      receipt(1, [fill({ usdg: '2000000' })]),
      receipt(2, [fill({ usdg: '5000000', exit: true })]),
    ],
  });

  const s = summarise(wire);
  assert.equal(s.notionalUsdg, '2000000');
  assert.equal(s.entryCount, 1);
  assert.equal(s.exitCount, 1);
});

test('the zero hash is no evidence, and counts as such', () => {
  const wire = snapshot({
    unattributed: [receipt(1, [fill()], ZERO), receipt(2, [fill()], '0xbeef')],
  });

  assert.equal(hasEvidence({ evidenceHash: ZERO }), false);
  assert.equal(summarise(wire).withEvidence, 1);
  assert.equal(summarise(wire).receiptCount, 2);
});

test('a receipt is found by id across both lists, and a missing one is null', () => {
  const wire = snapshot({ unattributed: [receipt(7, [fill()])] });
  assert.equal(findReceipt(wire, 7)?.id, 7);
  assert.equal(findReceipt(wire, 8), null);
});
