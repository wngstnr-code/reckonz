/**
 * What every card and every row on /assets is allowed to say.
 *
 * These four functions are the last thing between a measurement and a sentence
 * a person acts on, and two of the rules below were bugs before they were
 * rules. Neither was caught by anything: the runner glob and `check-tests.ts`
 * both listed directories flat, so a test file in this folder was collected by
 * nobody and would have passed by never running.
 *
 * The bias throughout is that a wrong answer must fail toward refusing. A page
 * that says "no depth right now" about a market that is fine costs a reader an
 * opportunity; one that says "allowed" about a trade the chain will reject
 * costs them the trade.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { BoardAsset } from '@/src/board';
import { freshness, pricing, usd, usdExact, verdictOf } from './board-format';

const LADDER = [250, 1_000, 50_000];

function asset(over: Partial<BoardAsset> = {}): BoardAsset {
  return {
    symbol: 'wSPYx',
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
    depth: 'ok',
    poolCount: 1,
    venueCount: 1,
    capacityUsdg: { 50: 5_000 },
    ladder: LADDER.map((sizeUsdg) => ({
      sizeUsdg,
      impactBps: sizeUsdg / 100,
      effectivePrice: 100 + sizeUsdg / 10_000,
      decision: { ok: sizeUsdg <= 1_000, reason: sizeUsdg <= 1_000 ? undefined : 'PRICE_IMPACT' },
    })) as BoardAsset['ladder'],
    ...over,
  };
}

// --------------------------------------------------------------- verdictOf

test('depth is answered before the ladder, so a dry pool is not "no price"', () => {
  // A dry pool comes back from the ladder as NO_DATA, and read straight through
  // the refusal table that renders as "we have no price for this yet" — when
  // the price is the one thing we do have. What is missing is the liquidity.
  const dry = verdictOf(asset({ depth: 'no-liquidity', fairValue: 100 }), 1_000);
  assert.equal(dry.kind, 'dry');
  assert.equal(dry.text, 'no depth right now');
  assert.notEqual(dry.text, 'we have no price for this yet');
});

test('a token nobody has pooled is told apart from a pool that ran dry', () => {
  assert.equal(verdictOf(asset({ depth: 'no-pool' }), 1_000).text, 'no pool for this token');
  assert.equal(verdictOf(asset({ depth: 'no-liquidity' }), 1_000).text, 'no depth right now');
});

test('a read that failed is never rendered as a market that is empty', () => {
  const v = verdictOf(asset({ depth: 'unreadable' }), 1_000);
  assert.equal(v.kind, 'unreadable');
  assert.equal(v.ok, false);
});

test('a size the board never measured is refused, not answered from another rung', () => {
  // The regression this exists for: the lookup used to fall back to ladder[0],
  // so a question about $50,000 was answered with a decision made about $250 —
  // and answered "allowed", which is the one direction this must never fail in.
  const v = verdictOf(asset(), 2_500);
  assert.equal(v.ok, false);
  assert.equal(v.text, 'not measured at this size');
});

test('an empty ladder refuses rather than throwing', () => {
  assert.equal(verdictOf(asset({ ladder: [] }), 1_000).ok, false);
});

test('a measured rung is answered from that rung and no other', () => {
  assert.equal(verdictOf(asset(), 250).ok, true);
  assert.equal(verdictOf(asset(), 1_000).ok, true);

  const refused = verdictOf(asset(), 50_000);
  assert.equal(refused.ok, false);
  assert.equal(refused.kind, 'refused');
  assert.equal(refused.code, 'PRICE_IMPACT');
  assert.equal(refused.text, 'too big for this market');
});

test('a refusal code with no sentence still reaches the reader as a refusal', () => {
  // `Rejection` is a closed union, so the compiler says this cannot happen. The
  // compiler is describing this build; the board arrives at runtime from a JSON
  // file or a blob that a newer worker wrote, and a code added on that side
  // reaches this one before the sentence for it does. The cast is the point of
  // the test, not a way around it.
  const odd = asset({
    ladder: [
      {
        sizeUsdg: 250,
        impactBps: 7,
        effectivePrice: 100.7,
        decision: { ok: false, reason: 'SOMETHING_NEW' },
      },
    ] as unknown as BoardAsset['ladder'],
  });
  const v = verdictOf(odd, 250);
  assert.equal(v.ok, false);
  assert.equal(v.code, 'SOMETHING_NEW');
});

// ----------------------------------------------------------------- pricing

test('a board where the issuer answered for nothing is blind, not empty', () => {
  // Measured on 2026-08-17: both issuer hosts returned 502, all thirty values
  // were withheld, and nineteen markets still held real depth. Blind is the
  // flag that stops that rendering as nineteen broken markets.
  const board = { assets: [asset({ publishable: false, fairValue: null })] };
  const p = pricing(board);
  assert.equal(p.blind, true);
  assert.equal(p.priced, 0);
  assert.equal(p.unpriced, 1);
});

test('publishable with no value is unpriced, and so is a value that is unpublishable', () => {
  // Both halves must hold. Either one alone would let a withheld number render.
  assert.equal(pricing({ assets: [asset({ publishable: true, fairValue: null })] }).priced, 0);
  assert.equal(pricing({ assets: [asset({ publishable: false, fairValue: 100 })] }).priced, 0);
});

test('a partly priced board is not blind, because some of it can be traded', () => {
  const p = pricing({
    assets: [asset(), asset({ symbol: 'wQQQx', publishable: false, fairValue: null })],
  });
  assert.equal(p.blind, false);
  assert.equal(p.priced, 1);
  assert.equal(p.unpriced, 1);
});

test('a board with no assets at all is not blind, because there is nothing to be blind about', () => {
  assert.equal(pricing({ assets: [] }).blind, false);
});

// --------------------------------------------------------------- freshness

test('freshness judges the age rather than printing it', () => {
  const at = 1_786_000_000;
  const ms = (seconds: number) => (at + seconds) * 1000;

  assert.equal(freshness(at, ms(60)).level, 'current');
  assert.equal(freshness(at, ms(2 * 3600 - 1)).level, 'current');
  assert.equal(freshness(at, ms(2 * 3600)).level, 'ageing');
  assert.equal(freshness(at, ms(12 * 3600 - 1)).level, 'ageing');
  assert.equal(freshness(at, ms(12 * 3600)).level, 'stale');
});

test('only a stale board carries the warning, so the warning keeps meaning something', () => {
  const at = 1_786_000_000;
  assert.equal(freshness(at, (at + 60) * 1000).warning, null);
  assert.equal(freshness(at, (at + 3 * 3600) * 1000).warning, null);
  assert.ok(freshness(at, (at + 24 * 3600) * 1000).warning);
});

test('the label changes unit rather than printing 2,880 minutes', () => {
  const at = 1_786_000_000;
  const label = (seconds: number) => freshness(at, (at + seconds) * 1000).label;

  assert.equal(label(120), '2 min ago');
  assert.equal(label(3 * 3600), '3 h ago');
  assert.equal(label(3 * 86_400), '3 days ago');
});

test('a board stamped in the future reads as now rather than as a negative age', () => {
  // Clock skew between the worker and the reader is real and is not a story
  // worth telling on the page.
  const at = 1_786_000_000;
  assert.equal(freshness(at, (at - 600) * 1000).seconds, 0);
  assert.equal(freshness(at, (at - 600) * 1000).level, 'current');
});

// ----------------------------------------------------------------- amounts

test('cents survive only where they carry the argument', () => {
  // "$178,500 at once, $5 planned" reads like a rounding error. $5.43 reads
  // like a measurement, and that contrast is the whole point of the figure.
  assert.equal(usdExact(5.43), '$5.43');
  assert.equal(usdExact(178_500), '$178,500');
  assert.equal(usd(5.43), '$5');
  assert.equal(usd(1_086.34), '$1,086');
});
