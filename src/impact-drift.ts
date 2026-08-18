/**
 * How far a boundary-sized leg drifts past its limit between the plan and the
 * guard — measured, so `PLAN_HEADROOM` can stop being a choice.
 *
 * D89 is the whole reason this exists. `capacity()` solves for the largest size
 * whose impact is still inside the limit, so a capacity-limited leg lands *on*
 * that boundary by construction. Stage 6 then re-reads pool state seconds and a
 * dozen RPC calls later and rejects on `>`, so the same thesis run twice minutes
 * apart allowed both legs once and rejected at 51bp the next time, with nothing
 * edited in between. `PLAN_HEADROOM = 0.9` closes that — and 0.9 was picked, not
 * derived, and is commented as such.
 *
 * **The comment it was picked under claimed data that does not exist.** It said
 * the honest version was to derive the fraction from "the impact volatility
 * already recorded in `observations/`". That store holds the issuer's marks —
 * mid, spread, session — and nothing about pools. The board *does* measure the
 * depth ladder, but `board-store.ts` writes one key, `board/latest.json`, and
 * overwrites it hourly. There is no history of pool impact anywhere in this
 * repo. So this is not a derivation from data we have; it is the measurement
 * that has to exist first.
 *
 * **What it measures, and why this shape rather than a simpler one.** Sampling
 * impact at a fixed size over time would answer a different question — how much
 * does this pool move in general — and would need a model to turn into a
 * headroom. This reproduces the failure instead:
 *
 *   1. walk the pools, and size a leg with `capacity(venues, limit)` — the same
 *      call, at the same limit, that produced the leg D89 caught
 *   2. wait, the way a run waits between its stages
 *   3. walk the pools again and quote *that same size* against the new state
 *
 * The second impact is what the guard would have measured. `deltaBps` is how far
 * past the limit it landed, and it is the only number here that matters. A
 * negative delta is a pool that moved in our favour and is kept: dropping them
 * would turn a distribution into an argument.
 *
 * It costs no gas and holds no key — every call is `eth_call` — which is why it
 * can run beside the publish worker without touching the runway.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { type Address } from 'viem';
import { USDG } from './chain';
import { bestQuote, capacity, loadVenues } from './planner';

/** Append-only, one line per paired walk per asset. Committed, like the marks. */
export const DRIFT_STORE = process.env.IMPACT_DRIFT_PATH ?? 'observations/impact-drift.jsonl';

export interface DriftSample {
  symbol: string;
  /** The impact limit the leg was sized against — `DEFAULT_MANDATE.maxImpactBps` in practice. */
  limitBps: number;
  /** Whole USDG the first walk said this pool could absorb inside `limitBps`. */
  sizeUsdg: number;
  /** Impact of `sizeUsdg` on the first walk. Sits on `limitBps` by construction. */
  fromBps: number;
  /** Impact of the *same* size on the second walk. This is the guard's number. */
  toBps: number;
  /** `toBps - fromBps`. Positive is drift against us. */
  deltaBps: number;
  /** Seconds between the two walks, measured rather than assumed. */
  gapSec: number;
  /** When the second walk finished — the moment the verdict would have been given. */
  observedAt: number;
}

/**
 * The identity of a sample is `symbol` + `observedAt`, exactly as it is for the
 * issuer's marks: one asset cannot be measured twice at the same instant, so a
 * merge of two stores collected on different machines dedupes on it and can be
 * run twice with no effect the second time.
 */
export function mergeDrift(
  into: readonly DriftSample[],
  from: readonly DriftSample[],
): DriftSample[] {
  const seen = new Map<string, DriftSample>();
  for (const s of [...into, ...from]) seen.set(`${s.symbol}@${s.observedAt}`, s);
  return [...seen.values()].sort(
    (a, b) => a.observedAt - b.observedAt || a.symbol.localeCompare(b.symbol),
  );
}

/**
 * Nearest-rank quantile, and deliberately not an interpolating one.
 *
 * Interpolation invents a value between two measurements. Every number this
 * repo publishes is one it can point at, and a headroom derived from a drift
 * nobody observed would be exactly the "measurement's clothes" `capacity()`'s
 * old ceiling was caught wearing. Nearest-rank returns an observation.
 */
export function quantile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  if (!(p > 0 && p <= 1)) throw new Error(`quantile p=${p} must be in (0, 1]`);
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil(p * sorted.length);
  return sorted[Math.min(rank, sorted.length) - 1]!;
}

export interface HeadroomSuggestion {
  /** How many samples the suggestion rests on. */
  samples: number;
  /** The quantile used, so the number is never quoted without its confidence. */
  p: number;
  /** Drift at that quantile, in bps of impact. Never negative — see below. */
  driftBps: number;
  /** The limit the drift was measured against; a fraction is meaningless without it. */
  limitBps: number;
  /** `1 - driftBps / limitBps`, clamped. What `PLAN_HEADROOM` should be. */
  headroom: number;
  /** Set when the suggestion is not yet worth acting on. */
  withheld: string | null;
}

/**
 * The fewest samples this will suggest a number from.
 *
 * A 99th percentile over twenty observations is the twentieth one wearing a
 * percentile's clothes. Thirty is the same bar `measure.ts` holds the gap σ to,
 * and it is held for the same reason: a headroom derived from a short series
 * would look better justified than the choice it replaced and be worse.
 */
export const MIN_SAMPLES = 30;

/**
 * Turn a store of drifts into the fraction of the guard's limit the planner may
 * spend.
 *
 * The arithmetic, stated so it can be argued with: the planner sizes a leg to
 * `limit * headroom`, the pool drifts by `delta` before the guard looks, so the
 * guard measures about `limit * headroom + delta`. Requiring that to stay inside
 * `limit` gives `headroom <= 1 - delta / limit`. Take `delta` at a high quantile
 * rather than the maximum: the maximum of a growing series only ever falls, so a
 * headroom pinned to it would ratchet tighter forever on the worst minute the
 * sampler ever saw.
 *
 * Favourable drift is floored at zero rather than allowed to widen the headroom
 * past 1. A pool that moved our way does not license sizing *past* the limit —
 * the guard still rejects on `>`, and the drift's sign is not something the
 * planner gets to know in advance.
 */
export function suggestHeadroom(
  samples: readonly DriftSample[],
  limitBps: number,
  p = 0.99,
): HeadroomSuggestion {
  const atLimit = samples.filter((s) => s.limitBps === limitBps);
  const drifts = atLimit.map((s) => s.deltaBps);
  const raw = quantile(drifts, p);
  const driftBps = raw === null ? 0 : Math.max(0, raw);
  // Bounded below at 0.5 because a headroom that halves every reported size is
  // a different product decision, not a parameter — if the measurement ever
  // asks for one, that is a conversation, not a constant.
  const headroom = Math.min(1, Math.max(0.5, 1 - driftBps / limitBps));
  return {
    samples: atLimit.length,
    p,
    driftBps,
    limitBps,
    headroom,
    withheld:
      atLimit.length === 0
        ? `no samples at a ${limitBps}bp limit`
        : atLimit.length < MIN_SAMPLES
          ? `${atLimit.length} samples, under the ${MIN_SAMPLES} this will suggest a number from`
          : null,
  };
}

/** Coverage per asset, so a suggestion that rests on one pool is visible as one. */
export function driftCoverage(
  samples: readonly DriftSample[],
): { symbol: string; samples: number; worstBps: number }[] {
  const by = new Map<string, DriftSample[]>();
  for (const s of samples) by.set(s.symbol, [...(by.get(s.symbol) ?? []), s]);
  return [...by.entries()]
    .map(([symbol, rows]) => ({
      symbol,
      samples: rows.length,
      worstBps: Math.max(...rows.map((r) => r.deltaBps)),
    }))
    .sort((a, b) => b.worstBps - a.worstBps);
}

export interface Target {
  symbol: string;
  address: Address;
}

/**
 * One paired walk over one asset.
 *
 * Returns `null` rather than a zero when the asset cannot be measured — an
 * empty pool, or a size the second walk could not quote at all. A drift of zero
 * and an absence of measurement are the same trap D77 found on the exit path,
 * and a store that records the second as the first would pull the suggested
 * headroom toward 1 with observations nobody made.
 */
export async function measureDrift(
  target: Target,
  limitBps: number,
  gapSec: number,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<DriftSample | null> {
  const first = await loadVenues(target.address);
  if (first.length === 0) return null;

  const size = capacity(first, limitBps);
  if (size <= 0n) return null;
  const from = bestQuote(first, size);
  if (!from) return null;

  const startedAt = Date.now();
  await wait(gapSec * 1000);

  // A second, independent walk. Reusing the first snapshot would measure
  // nothing: the whole question is what changed in the pools while we waited.
  const second = await loadVenues(target.address);
  const to = second.length ? bestQuote(second, size) : null;
  if (!to) return null;

  const observedAt = Math.floor(Date.now() / 1000);
  return {
    symbol: target.symbol,
    limitBps,
    sizeUsdg: Number(size) / 10 ** USDG.decimals,
    fromBps: from.impactBps,
    toBps: to.impactBps,
    deltaBps: to.impactBps - from.impactBps,
    // Measured, not `gapSec`: the second walk is a dozen throttled RPC calls and
    // takes as long as it takes. Recording the requested gap would understate
    // the window every sample was actually exposed to.
    gapSec: Math.round((Date.now() - startedAt) / 1000),
    observedAt,
  };
}

export function readDrift(path = DRIFT_STORE): DriftSample[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as DriftSample);
}

/**
 * Append, because a sampler that rewrites the file loses every earlier run to
 * one crash mid-write. The only operation here that rewrites is `--merge`, for
 * the same reason it is in `observations.ts`: a merge cannot be expressed as an
 * append without leaving the file out of order and the duplicates in.
 */
export function appendDrift(samples: readonly DriftSample[], path = DRIFT_STORE): void {
  if (samples.length === 0) return;
  appendFileSync(path, samples.map((s) => JSON.stringify(s)).join('\n') + '\n');
}
