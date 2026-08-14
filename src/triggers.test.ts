/**
 * Unit tests for the compiled-thesis-trigger encoder: `scaleThreshold`,
 * `unscaleThreshold`, `describeOnchainTrigger`, `encodeTriggers`.
 *
 * No network, no chain client — everything here is pure. See src/triggers.ts
 * for the shape being encoded and why `capacityUsdg` is the one metric that
 * must never be confused with the rest.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getAddress, type Address } from 'viem';
import { TRIGGER_METRICS, metricIndex, comparatorIndex, type TriggerMetric } from './abi';
import {
  scaleThreshold,
  unscaleThreshold,
  describeOnchainTrigger,
  encodeTriggers,
  type OnchainTrigger,
} from './triggers';
import type { ResolvedTrigger } from './thesis';

// ------------------------------------------------------------- scaleThreshold

test('scaleThreshold leaves every non-cash metric untouched (raw integer, truncated)', () => {
  for (const metric of TRIGGER_METRICS) {
    if (metric === 'capacityUsdg') continue;
    // 42.9 truncates to 42 rather than rounding — a comparison against a
    // fractional gapRisk or basisBps is a rule nobody wrote.
    assert.equal(scaleThreshold(metric, 42.9), 42n, `metric=${metric}`);
    assert.equal(scaleThreshold(metric, -7), -7n, `metric=${metric}`);
  }
});

test('scaleThreshold scales capacityUsdg to USDG at 6 decimals — the one cash-denominated metric', () => {
  // Pinned explicitly against the known scale factor (1e6), not just
  // round-tripped: a round-trip passes even if both directions share the
  // same wrong factor, which is exactly the defect this module exists to
  // prevent (see module docstring in triggers.ts).
  assert.equal(scaleThreshold('capacityUsdg', 1000), 1_000_000_000n);
  assert.equal(scaleThreshold('capacityUsdg', 1), 1_000_000n);
  assert.equal(scaleThreshold('capacityUsdg', 0.5), 500_000n);
});

test('unscaleThreshold divides capacityUsdg by 1e6, and returns other metrics as-is', () => {
  assert.equal(unscaleThreshold('capacityUsdg', 1_000_000_000n), 1000);
  assert.equal(unscaleThreshold('capacityUsdg', 500_000n), 0.5);
  for (const metric of TRIGGER_METRICS) {
    if (metric === 'capacityUsdg') continue;
    assert.equal(unscaleThreshold(metric, 42n), 42);
  }
});

test('scaleThreshold / unscaleThreshold round-trip for every metric', () => {
  for (const metric of TRIGGER_METRICS) {
    const original = metric === 'capacityUsdg' ? 12345.5 : 60;
    const scaled = scaleThreshold(metric, original);
    const back = unscaleThreshold(metric, scaled);
    assert.equal(back, original, `metric=${metric}`);
  }
});

// -------------------------------------------------------- describeOnchainTrigger

test('describeOnchainTrigger renders metric, comparator and threshold in human units', () => {
  const t: OnchainTrigger = {
    metric: metricIndex('gapRisk'),
    comparator: comparatorIndex('gt'),
    threshold: 60n,
    assets: [],
  };
  const description = describeOnchainTrigger(t);
  assert.match(description, /gapRisk/);
  assert.match(description, />/);
  assert.match(description, /60/);
});

test('describeOnchainTrigger un-scales capacityUsdg and labels it in USDG', () => {
  const t: OnchainTrigger = {
    metric: metricIndex('capacityUsdg'),
    comparator: comparatorIndex('lt'),
    threshold: 1_000_000_000n, // 1000 USDG at chain precision
    assets: [],
  };
  const description = describeOnchainTrigger(t);
  assert.match(description, /1000/);
  assert.match(description, /USDG/);
  // A non-cash metric must never carry the USDG suffix.
  const other = describeOnchainTrigger({
    metric: metricIndex('gapRisk'),
    comparator: comparatorIndex('lt'),
    threshold: 60n,
    assets: [],
  });
  assert.doesNotMatch(other, /USDG/);
});

test('describeOnchainTrigger says "basket" for an empty assets array rather than printing nothing', () => {
  const t: OnchainTrigger = {
    metric: metricIndex('gapRisk'),
    comparator: comparatorIndex('gt'),
    threshold: 60n,
    assets: [],
  };
  const description = describeOnchainTrigger(t);
  assert.match(description, /basket/);
});

test('describeOnchainTrigger resolves scoped assets through the symbol map, and falls back to the raw address', () => {
  const asset = getAddress('0x943bf64d566c32a2bcd41ac92fb63c111cc9de8f');
  const symbolOf = new Map([[asset.toLowerCase(), 'wAAPLx']]);

  const known: OnchainTrigger = {
    metric: metricIndex('gapRisk'),
    comparator: comparatorIndex('gt'),
    threshold: 60n,
    assets: [asset],
  };
  assert.match(describeOnchainTrigger(known, symbolOf), /wAAPLx/);

  // A symbol not in the map falls back to the address rather than throwing
  // or silently dropping the asset from the description.
  const unknownAsset = getAddress('0x000000000000000000000000000000000000dead');
  const unknown: OnchainTrigger = {
    metric: metricIndex('gapRisk'),
    comparator: comparatorIndex('gt'),
    threshold: 60n,
    assets: [unknownAsset],
  };
  const description = describeOnchainTrigger(unknown, symbolOf);
  assert.match(description.toLowerCase(), /0x000000000000000000000000000000000000dead/);
});

test('describeOnchainTrigger falls back to metric#N for a metric index past the known enum', () => {
  const t: OnchainTrigger = { metric: 99, comparator: comparatorIndex('gt'), threshold: 1n, assets: [] };
  const description = describeOnchainTrigger(t);
  assert.match(description, /metric#99/);
});

// Found by the first unit tests ever written for this module, and fixed.
//
// `describeOnchainTrigger` computed a `comparator#N` fallback for an
// out-of-range index and then threw it away: the render line only tested
// `comparator === 'gt' ? '>' : '<'`, so anything it could not decode came out
// as `<` — the opposite operator, in a sentence describing a risk control, in
// the renderer that `pnpm mandate:show` and the browser panel both print.
// `metric#N` did not have the bug because it was interpolated directly, and
// that asymmetry is what hid it.
//
// Unreachable with today's contract, where the comparator is only 0 or 1. It is
// exactly the "the contract is newer than this file" case `metricName` in
// `abi.ts` was written to handle, and its rule applies here too: a wrong label
// on a risk metric is worse than a missing one.
test('an unrecognised comparator index is surfaced, not rendered as a plausible "<"', () => {
  const t: OnchainTrigger = { metric: metricIndex('gapRisk'), comparator: 99, threshold: 1n, assets: [] };
  const description = describeOnchainTrigger(t);
  assert.match(description, /comparator#99/);
  assert.doesNotMatch(description, /</);
});

// -------------------------------------------------------------- encodeTriggers

const AAPL = getAddress('0x943bf64d566c32a2bcd41ac92fb63c111cc9de8f');
const MSFT = getAddress('0x166fbe68274b6a47e025f4ba17388c539f1fa1d0');

function resolvedTrigger(overrides: Partial<{
  metric: TriggerMetric;
  comparator: 'gt' | 'lt';
  threshold: number;
  appliesTo: string[];
  symbols: string[];
}> = {}): ResolvedTrigger {
  return {
    trigger: {
      metric: (overrides.metric ?? 'gapRisk') as never,
      comparator: overrides.comparator ?? 'gt',
      threshold: overrides.threshold ?? 60,
      appliesTo: overrides.appliesTo ?? [],
    },
    symbols: overrides.symbols ?? [],
    unresolved: [],
  };
}

test('encodeTriggers resolves symbols to addresses and matches the Trigger struct shape', () => {
  const addressOf = new Map<string, Address>([['wAAPLx', AAPL]]);
  const resolved = [
    resolvedTrigger({
      metric: 'gapRisk',
      comparator: 'gt',
      threshold: 60,
      appliesTo: ['Apple'],
      symbols: ['wAAPLx'],
    }),
  ];

  const { triggers, dropped } = encodeTriggers(resolved, addressOf, [AAPL]);

  assert.equal(dropped.length, 0);
  assert.equal(triggers.length, 1);
  const t = triggers[0]!;
  // Exactly {metric, comparator, threshold, assets} — the shape setTriggers expects.
  assert.deepEqual(Object.keys(t).sort(), ['assets', 'comparator', 'metric', 'threshold']);
  assert.equal(t.metric, metricIndex('gapRisk'));
  assert.equal(t.comparator, comparatorIndex('gt'));
  assert.equal(t.threshold, 60n);
  assert.deepEqual(t.assets, [AAPL]);
});

test('encodeTriggers emits an empty assets array for a basket-wide trigger (appliesTo: [])', () => {
  const addressOf = new Map<string, Address>();
  const resolved = [resolvedTrigger({ appliesTo: [], symbols: [] })];
  const { triggers, dropped } = encodeTriggers(resolved, addressOf, []);
  assert.equal(dropped.length, 0);
  assert.equal(triggers.length, 1);
  assert.deepEqual(triggers[0]!.assets, []);
});

test('encodeTriggers scales the threshold through scaleThreshold, not a copy of the logic', () => {
  const addressOf = new Map<string, Address>();
  const resolved = [resolvedTrigger({ metric: 'capacityUsdg', threshold: 1000, appliesTo: [] })];
  const { triggers } = encodeTriggers(resolved, addressOf, []);
  assert.equal(triggers[0]!.threshold, 1_000_000_000n);
});

test('encodeTriggers reports an unknown metric rather than silently dropping it', () => {
  const addressOf = new Map<string, Address>();
  const resolved = [resolvedTrigger({ metric: 'notARealMetric' as TriggerMetric, appliesTo: [] })];
  const { triggers, dropped } = encodeTriggers(resolved, addressOf, []);
  assert.equal(triggers.length, 0);
  assert.equal(dropped.length, 1);
  assert.equal(dropped[0]!.reason, 'unknown metric');
});

test('encodeTriggers drops a trigger whose symbols all resolved but none are on the allowlist, and reports why', () => {
  const addressOf = new Map<string, Address>([['wAAPLx', AAPL]]);
  const resolved = [
    resolvedTrigger({ appliesTo: ['Apple'], symbols: ['wAAPLx'] }),
  ];
  // Allowlist only has MSFT, not AAPL.
  const { triggers, dropped } = encodeTriggers(resolved, addressOf, [MSFT]);
  assert.equal(triggers.length, 0);
  assert.equal(dropped.length, 1);
  assert.equal(dropped[0]!.reason, 'none of its assets are on the mandate allowlist');
});

test('encodeTriggers drops a trigger whose entities resolved to no symbol at all, and reports why', () => {
  const addressOf = new Map<string, Address>();
  const resolved = [resolvedTrigger({ appliesTo: ['SomeUnmappedEntity'], symbols: [] })];
  const { triggers, dropped } = encodeTriggers(resolved, addressOf, [AAPL]);
  assert.equal(triggers.length, 0);
  assert.equal(dropped.length, 1);
  assert.equal(dropped[0]!.reason, 'no asset resolved from the thesis entities');
});

test('encodeTriggers never widens a single-asset trigger to basket-wide when its assets are filtered out', () => {
  // A trigger scoped to one symbol not on the allowlist must be dropped, not
  // emitted with an empty assets array — an empty array means "whole basket"
  // to the contract, so silently emptying it would widen the rule instead of
  // narrowing it. This is the exact failure encodeTriggers's docstring names.
  const addressOf = new Map<string, Address>([['wAAPLx', AAPL]]);
  const resolved = [resolvedTrigger({ appliesTo: ['Apple'], symbols: ['wAAPLx'] })];
  const { triggers, dropped } = encodeTriggers(resolved, addressOf, []); // empty allowlist
  assert.equal(triggers.length, 0);
  assert.equal(dropped.length, 1);
});
