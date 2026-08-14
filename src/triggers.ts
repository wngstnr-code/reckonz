/**
 * The missing link between a compiled thesis and `PolicyGuard.setTriggers`.
 *
 * `compileMandate` produces `ResolvedTrigger[]` — a metric name, a comparator,
 * a plain `number` threshold, and *symbols*. `setTriggers` takes
 * `{ metric: uint8, comparator: uint8, threshold: int256, assets: address[] }`.
 * Nothing joined the two. `mandate-demo.ts` hand-wrote
 * `{ metric: 5, comparator: 1, threshold: 1_000_000000n, assets: [] }` and every
 * other caller would have had to hand-write its own — which is precisely how two
 * callers end up disagreeing about what "capacity below 1,000" means.
 *
 * So the scaling lives here, once, and both the CLI and the browser import it.
 *
 * **Only `capacityUsdg` is scaled.** Every other metric in `ExitTriggers.evaluate`
 * is compared against a raw integer: a 0–100 score, a basis-point figure, a count
 * of hours. Capacity is the one the oracle publishes at USDG's 6 decimals, so a
 * threshold of `1000` means 1,000 USDG and reaches the chain as `1_000_000000`.
 * Getting this wrong does not fail loudly — it installs a rule that is off by a
 * million and never fires.
 */
import { getAddress, type Address } from 'viem';
import {
  comparatorIndex,
  metricIndex,
  TRIGGER_COMPARATORS,
  TRIGGER_METRICS,
  type TriggerComparator,
  type TriggerMetric,
} from './abi';
import { USDG } from './chain';
import type { ResolvedTrigger } from './thesis';

/** A trigger in the exact shape `PolicyGuard.setTriggers` accepts. */
export interface OnchainTrigger {
  metric: number;
  comparator: number;
  threshold: bigint;
  assets: Address[];
}

/**
 * Metrics whose threshold is denominated in the settlement currency rather than
 * in a bare number. A list rather than a boolean, because the next one that
 * arrives should be added here and nowhere else.
 */
const CASH_DENOMINATED: ReadonlySet<TriggerMetric> = new Set<TriggerMetric>(['capacityUsdg']);

export function scaleThreshold(metric: TriggerMetric, threshold: number): bigint {
  if (!CASH_DENOMINATED.has(metric)) {
    // Truncation is deliberate: a comparison against `gapRisk > 60.5` is a
    // rule nobody wrote, and rounding it silently would invent one.
    return BigInt(Math.trunc(threshold));
  }
  const units = Math.round(threshold * 10 ** USDG.decimals);
  return BigInt(units);
}

export function unscaleThreshold(metric: TriggerMetric, threshold: bigint): number {
  if (!CASH_DENOMINATED.has(metric)) return Number(threshold);
  return Number(threshold) / 10 ** USDG.decimals;
}

/** Human form of a trigger already on chain, for a terminal or a page. */
export function describeOnchainTrigger(t: OnchainTrigger, symbolOf?: Map<string, string>): string {
  const metric = TRIGGER_METRICS[t.metric] ?? `metric#${t.metric}`;
  const comparator = TRIGGER_COMPARATORS[t.comparator] ?? `comparator#${t.comparator}`;
  const value = unscaleThreshold(metric as TriggerMetric, t.threshold);
  const scope = t.assets.length
    ? t.assets.map((a) => symbolOf?.get(a.toLowerCase()) ?? a).join(', ')
    : 'basket';
  const unit = CASH_DENOMINATED.has(metric as TriggerMetric) ? ' USDG' : '';
  // The fallback label above was computed and then thrown away: an unrecognised
  // comparator fell through to `<` and the sentence claimed a rule the chain
  // does not hold. `metric#N` survives into the output and `comparator#N` did
  // not, which is the asymmetry that hid it. Same rule as `metricName` in
  // `abi.ts` — a wrong label on a risk control is worse than a missing one, and
  // this renderer is what `pnpm mandate:show` and the browser panel both print.
  const operator = comparator === 'gt' ? '>' : comparator === 'lt' ? '<' : comparator;
  return `${scope}: exit when ${metric} ${operator} ${value}${unit}`;
}

export interface EncodeResult {
  triggers: OnchainTrigger[];
  /** Compiled triggers dropped because no allowed asset matched their scope. */
  dropped: { description: string; reason: string }[];
}

/**
 * Compiled thesis triggers → on-chain triggers.
 *
 * @param resolved     what `compileMandate` produced
 * @param addressOf    symbol → address, from `addressBySymbol()`
 * @param allowed      the mandate's allowlist; a trigger scoped to an asset the
 *                     mandate cannot hold is dropped rather than installed
 *
 * A trigger whose symbols all fall outside the allowlist is **dropped and
 * reported**, never silently narrowed to basket-wide. An empty `assets` array
 * means basket-wide to the contract, so quietly emptying one would widen a rule
 * from a single asset to every asset — the opposite of what the thesis said.
 */
export function encodeTriggers(
  resolved: ResolvedTrigger[],
  addressOf: Map<string, Address>,
  allowed: readonly Address[],
): EncodeResult {
  const allowSet = new Set(allowed.map((a) => a.toLowerCase()));
  const triggers: OnchainTrigger[] = [];
  const dropped: EncodeResult['dropped'] = [];

  for (const r of resolved) {
    const t = r.trigger;
    const metric = t.metric as TriggerMetric;
    const comparator = t.comparator as TriggerComparator;

    if (metricIndex(metric) < 0) {
      dropped.push({ description: `${metric} ${comparator} ${t.threshold}`, reason: 'unknown metric' });
      continue;
    }

    const basketWide = t.appliesTo.length === 0;
    const assets: Address[] = [];

    if (!basketWide) {
      for (const symbol of r.symbols) {
        const address = addressOf.get(symbol);
        if (address && allowSet.has(address.toLowerCase())) assets.push(getAddress(address));
      }
      if (assets.length === 0) {
        dropped.push({
          description: `${r.symbols.join(', ') || t.appliesTo.join(', ')}: ${metric} ${comparator} ${t.threshold}`,
          reason:
            r.symbols.length === 0
              ? 'no asset resolved from the thesis entities'
              : 'none of its assets are on the mandate allowlist',
        });
        continue;
      }
    }

    triggers.push({
      metric: metricIndex(metric),
      comparator: comparatorIndex(comparator),
      threshold: scaleThreshold(metric, t.threshold),
      assets,
    });
  }

  return { triggers, dropped };
}
