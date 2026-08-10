/**
 * Execution Planner.
 *
 * Turns "I want these weights" into "here is what this chain can actually
 * absorb, here is what it will cost you, and here is the schedule". Every
 * number comes from simulated swaps against live pool state — nothing is
 * assumed about depth.
 */
import { formatUnits, parseUnits, type Address } from 'viem';
import { serial, USDG } from './chain';
import {
  findAllPools,
  loadPool,
  simulateExactInput,
  spotPrice,
  type PoolSnapshot,
  type SwapResult,
  type TokenInfo,
} from './pool';

export interface Venue {
  pool: PoolSnapshot;
  /** true when USDG is token0, i.e. buying the equity is a zeroForOne swap */
  usdgIsToken0: boolean;
  asset: TokenInfo;
  /** price of one whole asset unit in USDG */
  spot: number;
}

/** Every USDG-quoted pool for an asset, across all fee tiers. */
export async function loadVenues(asset: Address): Promise<Venue[]> {
  const pools = await findAllPools(USDG.address, asset);
  const snapshots = await serial(pools, (p) => loadPool(p.address));

  return snapshots
    .filter((p) => p.liquidity > 0n)
    .map((pool) => {
      const usdgIsToken0 =
        pool.token0.address.toLowerCase() === USDG.address.toLowerCase();
      const assetToken = usdgIsToken0 ? pool.token1 : pool.token0;
      const raw = spotPrice(pool); // price of token1 in token0
      return {
        pool,
        usdgIsToken0,
        asset: assetToken,
        spot: usdgIsToken0 ? raw : 1 / raw,
      };
    });
}

export interface Quote {
  venue: Venue;
  result: SwapResult;
  /** whole units of the asset received */
  out: number;
  /** USDG paid per whole asset unit */
  effectivePrice: number;
  impactBps: number;
}

export function quote(venue: Venue, usdgAmount: bigint): Quote {
  const result = simulateExactInput(venue.pool, usdgAmount, venue.usdgIsToken0);
  const out = Number(formatUnits(result.amountOut, venue.asset.decimals));
  const paid = Number(formatUnits(usdgAmount, USDG.decimals));
  return {
    venue,
    result,
    out,
    effectivePrice: out > 0 ? paid / out : Infinity,
    impactBps: result.priceImpactBps,
  };
}

/** Routes to whichever fee tier yields the most output at this exact size. */
export function bestQuote(venues: Venue[], usdgAmount: bigint): Quote | null {
  const quotes = venues.map((v) => quote(v, usdgAmount)).filter((q) => q.out > 0);
  if (quotes.length === 0) return null;
  return quotes.reduce((a, b) => (b.out > a.out ? b : a));
}

/**
 * Largest single-shot USDG notional whose price impact stays within `maxBps`.
 * This is the number that should govern position sizing — and the number no
 * other allocator computes.
 */
export function capacity(venues: Venue[], maxBps: number): bigint {
  const unit = 10n ** BigInt(USDG.decimals);
  let lo = 0n;
  let hi = 1_000_000n * unit;

  const impactAt = (n: bigint): number => {
    const q = bestQuote(venues, n);
    return q ? q.impactBps : Number.POSITIVE_INFINITY;
  };

  if (impactAt(hi) <= maxBps) return hi;

  // 40 iterations of bisection gets us to sub-cent precision on any sane range
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2n;
    if (mid === lo || mid === hi) break;
    if (impactAt(mid) <= maxBps) lo = mid;
    else hi = mid;
  }
  return lo;
}

export interface Schedule {
  slices: number;
  perSlice: bigint;
  /** Expected impact of the whole order once sliced, in bps. */
  expectedImpactBps: number;
  /** Impact if the same order were fired in one shot. */
  singleShotImpactBps: number;
}

/**
 * Slicing only helps because arbitrageurs pull the pool back toward the deeper
 * reference market between slices. `recovery` is that assumption made explicit:
 * 1.0 = the pool fully re-prices between slices, 0 = it never does (in which
 * case slicing buys you nothing and the planner says so).
 */
export function schedule(
  venues: Venue[],
  total: bigint,
  maxBps: number,
  recovery = 0.7,
): Schedule {
  const single = bestQuote(venues, total);
  const singleShotImpactBps = single ? single.impactBps : Number.POSITIVE_INFINITY;

  const cap = capacity(venues, maxBps);
  if (cap === 0n || total <= cap) {
    return {
      slices: 1,
      perSlice: total,
      expectedImpactBps: singleShotImpactBps,
      singleShotImpactBps,
    };
  }

  const slices = Number((total + cap - 1n) / cap);
  const perSlice = total / BigInt(slices);
  const sliceQuote = bestQuote(venues, perSlice);
  const sliceImpact = sliceQuote ? sliceQuote.impactBps : Number.POSITIVE_INFINITY;

  // Unrecovered drift accumulates across slices.
  const residual = 1 - recovery;
  const drift = sliceImpact * residual * ((slices - 1) / 2);

  return {
    slices,
    perSlice,
    expectedImpactBps: Math.round(sliceImpact + drift),
    singleShotImpactBps,
  };
}

// ------------------------------------------------------------ basket plan

export interface BasketTarget {
  asset: Address;
  weightBps: number;
}

export interface PlanLine {
  symbol: string;
  targetBps: number;
  plannedBps: number;
  notional: number;
  capacityUsdg: number;
  naiveImpactBps: number;
  plannedImpactBps: number;
  slices: number;
  /** USDG lost to slippage under each approach */
  naiveCost: number;
  plannedCost: number;
  feeTier: number;
  note?: string;
}

export interface BasketPlan {
  lines: PlanLine[];
  totalUsdg: number;
  naiveCost: number;
  plannedCost: number;
  unallocated: number;
}

/**
 * Caps every leg at what its pool can absorb, then hands the freed capital to
 * legs that still have headroom (never exceeding 2x their original weight, so
 * the thesis is not silently rewritten). Anything that still does not fit is
 * reported as unallocated rather than forced into the market.
 */
export async function planBasket(
  targets: BasketTarget[],
  totalUsdg: number,
  maxImpactBps: number,
): Promise<BasketPlan> {
  const unit = 10n ** BigInt(USDG.decimals);
  const total = parseUnits(String(totalUsdg), USDG.decimals);

  const venuesByAsset = new Map<Address, Venue[]>();
  await serial(targets, async (t) =>
    venuesByAsset.set(t.asset, await loadVenues(t.asset)),
  );

  // pass 1 — naive allocation and each leg's true capacity
  const legs = targets.map((t) => {
    const venues = venuesByAsset.get(t.asset) ?? [];
    const naiveNotional = (total * BigInt(t.weightBps)) / 10_000n;
    const naiveQuote = bestQuote(venues, naiveNotional);
    const cap = venues.length ? capacity(venues, maxImpactBps) : 0n;
    return { target: t, venues, naiveNotional, naiveQuote, cap };
  });

  // pass 2 — cap, then redistribute the freed capital into remaining headroom
  let freed = 0n;
  const allocation = new Map<Address, bigint>();
  for (const leg of legs) {
    const capped = leg.naiveNotional > leg.cap ? leg.cap : leg.naiveNotional;
    freed += leg.naiveNotional - capped;
    allocation.set(leg.target.asset, capped);
  }

  for (const leg of legs) {
    if (freed === 0n) break;
    const current = allocation.get(leg.target.asset)!;
    const ceiling = (total * BigInt(leg.target.weightBps * 2)) / 10_000n;
    const headroom =
      (leg.cap < ceiling ? leg.cap : ceiling) - current;
    if (headroom <= 0n) continue;
    const take = headroom < freed ? headroom : freed;
    allocation.set(leg.target.asset, current + take);
    freed -= take;
  }

  // pass 3 — cost both approaches
  const lines: PlanLine[] = [];
  let naiveCost = 0;
  let plannedCost = 0;

  for (const leg of legs) {
    const planned = allocation.get(leg.target.asset)!;
    const plannedNum = Number(formatUnits(planned, USDG.decimals));
    const naiveNum = Number(formatUnits(leg.naiveNotional, USDG.decimals));

    const sched = leg.venues.length
      ? schedule(leg.venues, planned, maxImpactBps)
      : { slices: 0, perSlice: 0n, expectedImpactBps: 0, singleShotImpactBps: 0 };

    const naiveImpact = leg.naiveQuote?.impactBps ?? 0;
    const nCost = (naiveNum * naiveImpact) / 10_000;
    const pCost = (plannedNum * sched.expectedImpactBps) / 10_000;
    naiveCost += nCost;
    plannedCost += pCost;

    const symbol =
      leg.venues[0]?.asset.symbol ?? `${leg.target.asset.slice(0, 8)}…`;

    lines.push({
      symbol,
      targetBps: leg.target.weightBps,
      plannedBps: totalUsdg > 0 ? Math.round((plannedNum / totalUsdg) * 10_000) : 0,
      notional: plannedNum,
      capacityUsdg: Number(formatUnits(leg.cap, USDG.decimals)),
      naiveImpactBps: naiveImpact,
      plannedImpactBps: sched.expectedImpactBps,
      slices: sched.slices,
      naiveCost: nCost,
      plannedCost: pCost,
      feeTier: leg.venues.length
        ? (bestQuote(leg.venues, planned || unit)?.venue.pool.fee ?? 0)
        : 0,
      note: leg.venues.length === 0 ? 'no USDG pool' : undefined,
    });
  }

  return {
    lines,
    totalUsdg,
    naiveCost,
    plannedCost,
    unallocated: Number(formatUnits(freed, USDG.decimals)),
  };
}
