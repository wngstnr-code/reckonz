/**
 * When is this system down?
 *
 * The question the deployment could not answer on 2026-08-14, while the oracle
 * sat 173,242 seconds stale and every fill was refused. The rule is worth tests
 * rather than a comment because the tempting version of it — "the server
 * responded, so we are up" — was in effect the whole time and was wrong.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyHealth,
  healthHttpStatus,
  publishRunway,
  RUNWAY_WARN_DAYS,
  type AssetHealth,
  type HealthInput,
} from './health';

/**
 * A publisher with plenty of gas: 0.05 OKB at 0.02 gwei, which is what the key
 * actually held on 2026-08-18 and is a little over eighteen days of publishing
 * all thirty assets every ten minutes.
 */
const FUNDED = {
  address: '0x40101A4932dEb95f0A5951BB7fB0fFa7c17e3Ab8',
  balanceWei: 49_632_383_905_447_705n,
  gasPriceWei: 20_000_001n,
};

const FRESH: AssetHealth = {
  symbol: 'wSPYx',
  ageSeconds: 242,
  maxAgeSeconds: 900,
  hasValue: true,
  stale: false,
};

const STALE: AssetHealth = {
  symbol: 'wTSLAx',
  ageSeconds: 173_242,
  maxAgeSeconds: 900,
  hasValue: true,
  stale: true,
};

function input(over: Partial<HealthInput> = {}): HealthInput {
  return {
    blockNumber: 67_941_400n,
    rpcLatencyMs: 180,
    mandateId: 1,
    assets: [FRESH, { ...FRESH, symbol: 'wNVDAx' }],
    archiveConfigured: true,
    compilerConfigured: true,
    publisher: FUNDED,
    ...over,
  };
}

test('everything working is ok, with nothing to say', () => {
  const r = classifyHealth(input());
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.problems, []);
  assert.equal(healthHttpStatus(r.status), 200);
});

// ------------------------------------------------- the outage that happened

test('a stale oracle across the whole allowlist is DOWN, not degraded', () => {
  // The exact state of production for two days. A monitor that reads this as
  // healthy is a monitor that lets it sit there — the deployment was answering
  // in milliseconds the entire time.
  const r = classifyHealth(input({ assets: [STALE, { ...STALE, symbol: 'wQQQx' }] }));
  assert.equal(r.status, 'down');
  assert.equal(healthHttpStatus(r.status), 503);
  assert.match(r.problems[0]!, /refuse every fill/);
  assert.match(r.problems[0]!, /publisher has almost certainly stopped/);
  assert.match(r.problems[0]!, /173242s/);
});

test('one asset stale out of two is degraded — something can still trade', () => {
  const r = classifyHealth(input({ assets: [FRESH, STALE] }));
  assert.equal(r.status, 'degraded');
  assert.equal(healthHttpStatus(r.status), 200);
  assert.match(r.problems[0]!, /1 of 2/);
  assert.match(r.problems[0]!, /wTSLAx/);
});

test('a withheld value counts as unusable, even when it is fresh', () => {
  // `hasValue: false` is the oracle refusing to stand behind a number. The
  // observation is seconds old and `checkExecution` will still return
  // NO_REFERENCE, so treating freshness alone as health would report a system
  // that cannot trade as healthy.
  const withheld: AssetHealth = { ...FRESH, hasValue: false };
  const r = classifyHealth(input({ assets: [withheld] }));
  assert.equal(r.status, 'down');
});

test('an unreachable RPC is down whatever else is true', () => {
  const r = classifyHealth(input({ blockNumber: null, rpcLatencyMs: null }));
  assert.equal(r.status, 'down');
  assert.match(r.problems[0]!, /RPC did not answer/);
  assert.equal(r.chain.blockNumber, null);
});

test('an empty allowlist is down, because nothing is executable', () => {
  // Reached when the mandate read fails or the mandate holds nothing. Either
  // way there is no asset this deployment can fill, and saying "ok" would be
  // reporting on the web server rather than on the product.
  const r = classifyHealth(input({ assets: [] }));
  assert.equal(r.status, 'down');
});

// --------------------------------------- things that are wrong but not outages

test('a missing evidence archive is degraded, not down', () => {
  // Fills still work; every bundle written while this is false is a receipt
  // nobody can audit (D80). A slow silent loss is worth reporting and not worth
  // paging someone at 3am for.
  const r = classifyHealth(input({ archiveConfigured: false }));
  assert.equal(r.status, 'degraded');
  assert.equal(healthHttpStatus(r.status), 200);
  assert.match(r.problems[0]!, /cannot be audited/);
});

test('a missing compiler key is degraded', () => {
  const r = classifyHealth(input({ compilerConfigured: false }));
  assert.equal(r.status, 'degraded');
  assert.match(r.problems[0]!, /no key/);
});

test('down outranks degraded, and the worst problem is stated first', () => {
  const r = classifyHealth(
    input({ assets: [STALE], archiveConfigured: false, compilerConfigured: false }),
  );
  assert.equal(r.status, 'down');
  assert.equal(r.problems.length, 3);
  assert.match(r.problems[0]!, /refuse every fill/);
});

test('the report carries the numbers, not just a verdict', () => {
  // A page saying "degraded" and nothing else sends someone to look for the
  // reason in logs that do not exist. Everything needed to act is in the body.
  const r = classifyHealth(input({ assets: [FRESH, STALE] }), 1_786_000_000);
  assert.equal(r.checkedAt, 1_786_000_000);
  assert.equal(r.chain.blockNumber, '67941400');
  assert.equal(r.chain.latencyMs, 180);
  assert.equal(r.mandateId, 1);
  assert.equal(r.assets.length, 2);
  assert.equal(r.assets[1]!.ageSeconds, 173_242);
});

// ------------------------------------------------- the outage with a date on it

test('a funded publisher is not worth a sentence', () => {
  const r = classifyHealth(input());
  assert.equal(r.status, 'ok');
  assert.equal(r.runway?.runsLeft, 2585);
  // Eighteen days, which is the number measured against the live chain the day
  // this was written. If this fails, the gas arithmetic moved — check D85's
  // measured 919,563 before changing the expectation.
  assert.ok(r.runway!.days > 17.5 && r.runway!.days < 18.5, `days=${r.runway!.days}`);
});

test('a week of gas left is degraded, and says what to do about it', () => {
  // Half the funded balance is nine days; a fifth of it is under four.
  const r = classifyHealth(
    input({ publisher: { ...FUNDED, balanceWei: FUNDED.balanceWei / 5n } }),
  );
  assert.equal(r.status, 'degraded');
  assert.match(r.problems.join(' '), /days of gas left/);
  assert.match(r.problems.join(' '), /Top up 0x40101A49/);
  // Never down: the publisher is still publishing and every fill still works.
  assert.equal(healthHttpStatus(r.status), 200);
});

test('an empty publisher is degraded, not down — staleness is what makes it down', () => {
  const r = classifyHealth(input({ publisher: { ...FUNDED, balanceWei: 0n } }));
  assert.equal(r.status, 'degraded');
  assert.equal(r.runway?.runsLeft, 0);
});

test('a runway that could not be read is not a runway of zero', () => {
  const r = classifyHealth(input({ publisher: null }));
  assert.equal(r.status, 'degraded');
  assert.equal(r.runway, null);
  assert.match(r.problems.join(' '), /could not be read/);
  // The same absence, once the RPC is the reason for it, is already covered by
  // the sentence about the RPC — saying it twice would read as two faults.
  const noRpc = classifyHealth(input({ publisher: null, blockNumber: null }));
  assert.equal(noRpc.status, 'down');
  assert.equal(noRpc.problems.filter((p) => /gas balance/.test(p)).length, 0);
});

test('a zero gas price is an unreadable price, never free gas', () => {
  const r = classifyHealth(input({ publisher: { ...FUNDED, gasPriceWei: 0n } }));
  assert.equal(r.status, 'degraded');
  assert.equal(r.runway?.measurable, false);
  assert.equal(r.runway?.runsLeft, 0);
  assert.match(r.problems.join(' '), /gas price read as zero/);
});

test('publishing fewer assets buys proportionally more runs', () => {
  const thirty = publishRunway(FUNDED, 30);
  const four = publishRunway(FUNDED, 4);
  // Under-linear on purpose: the first write in a transaction pays for the
  // transaction, so four slots is not a fifteenth of the cost of thirty (D85).
  assert.ok(four.runsLeft > thirty.runsLeft * 5, `${four.runsLeft} vs ${thirty.runsLeft}`);
  assert.ok(four.runsLeft < thirty.runsLeft * 8, `${four.runsLeft} vs ${thirty.runsLeft}`);
});

test('the warning threshold is a lead time, and the boundary is not the alert', () => {
  // A day either side of the threshold, built from the constant rather than a
  // literal so the test follows the policy instead of pinning a coincidence.
  const perDay = FUNDED.balanceWei / BigInt(Math.round(publishRunway(FUNDED).days));
  const inside = classifyHealth(
    input({ publisher: { ...FUNDED, balanceWei: perDay * BigInt(RUNWAY_WARN_DAYS + 2) } }),
  );
  const outside = classifyHealth(
    input({ publisher: { ...FUNDED, balanceWei: perDay * BigInt(RUNWAY_WARN_DAYS - 2) } }),
  );
  assert.equal(inside.status, 'ok');
  assert.equal(outside.status, 'degraded');
});
