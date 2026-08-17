/**
 * The assets board: what the guard would say about every xStock, measured once
 * and written down.
 *
 * This exists because the page cannot compute it. `pnpm capacity` alone takes
 * about seventy seconds across the thirty assets on the throttled public RPC,
 * and that is before a single issuer quote, oracle read or guard decision. A
 * request that did this work would time out in production and would spend the
 * RPC budget of every visitor who arrived.
 *
 * So it follows the shape `observations/registry.jsonl` already has (D66): a
 * script measures, the result is committed, and the route reads the file. The
 * chain and the issuer stay authoritative; this is a transcript, not a source.
 *
 * **Every number here is a measurement with a date on it**, which is the rule
 * D84 left behind after capacity doubled in four days and eight documents were
 * caught quoting a stale figure as a fact. `measuredAt` is not decoration: any
 * surface rendering this must show it.
 *
 * The expensive call is `loadVenues`, once per asset. Everything after it —
 * capacity at four impact limits, a quote at each rung of the size ladder, the
 * guard's answer for each — is arithmetic over pool state already in memory, so
 * the ladder costs almost nothing on top of the walk.
 */
import { formatUnits, parseUnits, type Address } from 'viem';
import { serial, USDG } from './chain';
import { findAllPools } from './pool';
import { computeFairValue, specFor, type GapRiskBreakdown, type MarketState } from './fairvalue';
import { checkExecution, DEFAULT_MANDATE, type Decision } from './guard';
import { applyOnchainWithholding, universe } from './pipeline';
import { bestQuote, capacity, loadVenues } from './planner';

/**
 * Impact limits the board reports capacity at.
 *
 * 50bp first because it is `DEFAULT_MANDATE.maxImpactBps` — the number the
 * guard actually enforces — and the rest so a reader can see the curve rather
 * than one point on it.
 */
export const CAPACITY_LIMITS_BPS = [50, 100, 200, 500] as const;

/**
 * The sizes the guard is asked about.
 *
 * A verdict without a size is close to meaningless here. Since the oracle moved
 * to the issuer's mark (D62) almost nothing is refused for want of a reference;
 * what refuses assets now is `PRICE_IMPACT`, and impact is a function of size.
 * "22 refused" is not a fact about the market, it is the answer to "refused at
 * what size" — so the board carries the whole ladder and the page can ask.
 */
export const LADDER_USDG = [250, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000] as const;

export interface Rung {
  sizeUsdg: number;
  /** Null when no venue could fill it at all. */
  impactBps: number | null;
  effectivePrice: number | null;
  decision: Decision;
}

export interface BoardAsset {
  symbol: string;
  name?: string;
  address: Address;

  /** Null when the engine has no defensible number, or the chain withheld one. */
  fairValue: number | null;
  /**
   * False when the value must not be shown as a number at all. A renderer that
   * prints `fairValue` without checking this is printing something the oracle
   * refused to publish.
   */
  publishable: boolean;
  confidenceBps: number | null;
  reference: string | null;
  state: MarketState;
  sharesPerToken: number;

  gapRisk: number;
  gapRiskParts: GapRiskBreakdown;
  notes: string[];

  onchainPrice: number | null;
  basisBps: number | null;

  /**
   * Why there is no depth, when there is none.
   *
   * Three facts that a single zero would flatten into one, and the first run of
   * this script did exactly that: nine assets came back as capacity `0`, verdict
   * `NO_DATA`, indistinguishable from a token nobody has ever pooled.
   *
   * Probing the chain directly settled it — the pools exist and their in-range
   * liquidity really is `0`. `pnpm capacity` had priced the same nine hours
   * earlier, so somebody withdrew. That is a live market fact and the board
   * should say it plainly, but it is still not the same sentence as "there is
   * no pool" or "we could not read one", and `unreadable` is the one that must
   * never be rendered as a measurement.
   *
   * `no-liquidity` keeps capacity `0`, because zero is the true absorbable
   * size. `unreadable` carries `null` and no verdicts at all, and is named in
   * `totals.unmeasured` so the sums leave it out rather than averaging in a
   * failure.
   */
  depth: 'ok' | 'no-liquidity' | 'no-pool' | 'unreadable';
  /** USDG pools the factory knows about, at any fee tier. */
  poolCount: number;
  /** Of those, how many carry in-range liquidity. */
  venueCount: number;

  /** Absorbable USDG by impact limit in bps. Null only when unreadable. */
  capacityUsdg: Record<number, number | null>;
  /** Empty when unreadable: there is no honest verdict without pool state. */
  ladder: Rung[];
}

export interface Board {
  /** Unix seconds. Anything rendering this board must say when it was taken. */
  measuredAt: number;
  chainId: number;
  /** The mandate the verdicts were decided against, so a reader can check them. */
  mandate: typeof DEFAULT_MANDATE;
  capacityLimitsBps: number[];
  ladderUsdg: number[];
  assets: BoardAsset[];
  totals: {
    /** Summed absorbable USDG per impact limit. */
    capacityUsdg: Record<number, number>;
    /**
     * The middle asset, per impact limit.
     *
     * Reported beside the total because the total is half a truth on its own:
     * on 2026-08-17 one token was 67% of it, so the sum describes a market
     * almost nobody can reach while the median describes the one most assets
     * are actually in. D84 wrote the rule after the same shape showed up in
     * volume — read the concentration before the total.
     */
    medianUsdg: Record<number, number>;
    /** The single largest asset at the mandate's own limit, and its share. */
    largest: { symbol: string; usdg: number; shareOfTotal: number } | null;
    /** Symbols whose venues could not be read. Rendered, never quietly dropped. */
    unmeasured: string[];
    /**
     * Symbols with a pool and no liquidity in it, or no pool at all.
     *
     * Named separately because this is the finding, not the error: nine of the
     * thirty had depth hours before this and none at the moment it was taken.
     * A board that folded them in with the tradable ones would be describing a
     * market that is not there.
     */
    dry: string[];
  };
}

/**
 * Venues, and — when there are none — which of the three reasons it is.
 *
 * `loadVenues` drops pools whose in-range liquidity is zero, so an empty result
 * on its own says nothing about why. The extra `findAllPools` runs *only* in
 * that case, which costs four factory reads for the handful of assets that need
 * it rather than for all thirty.
 *
 * A read that throws is caught here rather than allowed to kill the run,
 * because one unreachable asset should not cost the other twenty-nine their
 * measurement. It is recorded as `unreadable`, which is the one state that must
 * never be mistaken for a thin market.
 */
async function depthOf(asset: Address): Promise<{
  venues: Awaited<ReturnType<typeof loadVenues>>;
  depth: BoardAsset['depth'];
  poolCount: number;
}> {
  try {
    const venues = await loadVenues(asset);
    if (venues.length > 0) return { venues, depth: 'ok', poolCount: venues.length };

    const pools = await findAllPools(USDG.address, asset);
    return {
      venues,
      depth: pools.length > 0 ? 'no-liquidity' : 'no-pool',
      poolCount: pools.length,
    };
  } catch {
    return { venues: [], depth: 'unreadable', poolCount: 0 };
  }
}

const usdgWhole = (raw: bigint) => Number(formatUnits(raw, USDG.decimals));

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2 : (sorted[mid] ?? 0);
}

/**
 * Walk every asset once and record what the guard would say about it.
 *
 * Serial rather than parallel, through `serial()`, because the public RPC
 * throttles hard and a board that trips the rate limiter reports its own noise
 * as a thin market.
 */
export async function measureBoard(chainId = 196): Promise<Board> {
  const now = Math.floor(Date.now() / 1000);
  const entries = await universe();

  const assets = await serial(entries, async (entry): Promise<BoardAsset> => {
    const { venues, depth, poolCount } = await depthOf(entry.address);
    const readable = depth !== 'unreadable';
    const onchainPrice = venues[0]?.spot ?? null;

    const report = await computeFairValue(specFor(entry.symbol), {
      now,
      onchainPrice: onchainPrice ?? undefined,
    });

    // The deployed contract has the last word. It can withhold a value this
    // engine considers publishable — the publish-time jump bound refuses a move
    // it cannot confirm yet (D41) — and without asking, the board would answer
    // ALLOW where the chain answers NO_REFERENCE. Optimistic is the wrong
    // direction for a guard to be wrong in.
    await applyOnchainWithholding(entry.address, report, now);

    // Zero is the true absorbable size for a pool with no in-range liquidity.
    // Null is reserved for the one case where nothing was learned at all.
    const capacityUsdg: Record<number, number | null> = {};
    for (const limit of CAPACITY_LIMITS_BPS) {
      capacityUsdg[limit] = !readable
        ? null
        : venues.length
          ? usdgWhole(capacity(venues, limit))
          : 0;
    }

    const nothingToFill =
      depth === 'no-pool'
        ? 'no USDG pool exists for this token'
        : 'the pools exist but hold no liquidity at the current price';

    // Nothing read, nothing to say. An empty ladder is the honest shape for
    // `unreadable`: the guard was never asked, so there is no verdict either way.
    const ladder: Rung[] = !readable
      ? []
      : LADDER_USDG.map((sizeUsdg) => {
      const quote = venues.length
        ? bestQuote(venues, parseUnits(String(sizeUsdg), USDG.decimals))
        : null;
      if (!quote) {
        return {
          sizeUsdg,
          impactBps: null,
          effectivePrice: null,
          decision: { ok: false, reason: 'NO_DATA', detail: nothingToFill },
        };
      }
      return {
        sizeUsdg,
        impactBps: quote.impactBps,
        effectivePrice: quote.effectivePrice,
        decision: checkExecution(
          report,
          quote.effectivePrice,
          quote.impactBps,
          DEFAULT_MANDATE,
          now,
        ),
      };
    });

    return {
      symbol: entry.symbol,
      name: entry.name,
      address: entry.address,
      fairValue: report.publishable ? report.fairValue : null,
      publishable: report.publishable,
      confidenceBps: report.confidenceBps,
      reference: report.reference,
      state: report.state,
      sharesPerToken: report.sharesPerToken,
      gapRisk: report.gapRisk,
      gapRiskParts: report.gapRiskParts,
      notes: report.notes,
      onchainPrice,
      basisBps: report.basisBps ?? null,
      depth,
      poolCount,
      venueCount: venues.length,
      capacityUsdg,
      ladder,
    };
  });

  // Only `unreadable` is excluded. An asset whose pools are empty really does
  // absorb nothing, and dropping it would flatter the median; an asset we could
  // not read contributes nothing but a guess, and folding it in as zero would
  // be a failure presented as a thin market.
  const priced = assets.filter((a) => a.depth !== 'unreadable');
  const totalsByLimit: Record<number, number> = {};
  const medianByLimit: Record<number, number> = {};
  for (const limit of CAPACITY_LIMITS_BPS) {
    const values = priced.map((a) => a.capacityUsdg[limit] ?? 0);
    totalsByLimit[limit] = values.reduce((sum, v) => sum + v, 0);
    medianByLimit[limit] = median(values);
  }

  const limit = DEFAULT_MANDATE.maxImpactBps;
  const ranked = [...priced].sort(
    (a, b) => (b.capacityUsdg[limit] ?? 0) - (a.capacityUsdg[limit] ?? 0),
  );
  const top = ranked[0];
  const total = totalsByLimit[limit] ?? 0;

  return {
    measuredAt: now,
    chainId,
    mandate: DEFAULT_MANDATE,
    capacityLimitsBps: [...CAPACITY_LIMITS_BPS],
    ladderUsdg: [...LADDER_USDG],
    assets,
    totals: {
      capacityUsdg: totalsByLimit,
      medianUsdg: medianByLimit,
      largest:
        top && total > 0
          ? {
              symbol: top.symbol,
              usdg: top.capacityUsdg[limit] ?? 0,
              shareOfTotal: (top.capacityUsdg[limit] ?? 0) / total,
            }
          : null,
      unmeasured: assets.filter((a) => a.depth === 'unreadable').map((a) => a.symbol),
      dry: assets.filter((a) => a.depth === 'no-liquidity' || a.depth === 'no-pool').map((a) => a.symbol),
    },
  };
}
