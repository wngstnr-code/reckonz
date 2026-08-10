/**
 * Pool snapshot loader + exact-input swap simulation against real X Layer state.
 *
 * The whole tick window is prefetched in two multicalls so the simulation
 * itself is pure and synchronous — the planner runs thousands of simulations
 * during binary search and TWAP sizing, and none of them touch the network.
 */
import { getAddress, parseAbi, type Address } from 'viem';
import { ADDR, client, FEE_TIERS, serial } from './chain';
import {
  computeSwapStep,
  compressTick,
  getSqrtRatioAtTick,
  MAX_SQRT_RATIO,
  MIN_SQRT_RATIO,
  MIN_TICK,
  MAX_TICK,
  nextInitializedTickWithinOneWord,
  Q96,
  tickBitmapPosition,
} from './v3math';

const poolAbi = parseAbi([
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function liquidity() view returns (uint128)',
  'function fee() view returns (uint24)',
  'function tickSpacing() view returns (int24)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function tickBitmap(int16 wordPosition) view returns (uint256)',
  'function ticks(int24 tick) view returns (uint128 liquidityGross, int128 liquidityNet, uint256 feeGrowthOutside0X128, uint256 feeGrowthOutside1X128, int56 tickCumulativeOutside, uint160 secondsPerLiquidityOutsideX128, uint32 secondsOutside, bool initialized)',
]);

const factoryAbi = parseAbi([
  'function getPool(address tokenA, address tokenB, uint24 fee) view returns (address)',
]);

const erc20Abi = parseAbi([
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function name() view returns (string)',
]);

export interface TokenInfo {
  address: Address;
  symbol: string;
  decimals: number;
  name?: string;
}

export interface PoolSnapshot {
  address: Address;
  token0: TokenInfo;
  token1: TokenInfo;
  fee: number;
  tickSpacing: number;
  sqrtPriceX96: bigint;
  tick: number;
  liquidity: bigint;
  /** wordPos -> bitmap word */
  words: Map<number, bigint>;
  /** initialized tick -> liquidityNet */
  ticks: Map<number, bigint>;
  blockNumber: bigint;
}

/** How many bitmap words to prefetch either side of the active tick. */
const WORD_WINDOW = 6;

export async function loadToken(address: Address): Promise<TokenInfo> {
  const [symbol, decimals, name] = await Promise.all([
    client.readContract({ address, abi: erc20Abi, functionName: 'symbol' }),
    client.readContract({ address, abi: erc20Abi, functionName: 'decimals' }),
    client
      .readContract({ address, abi: erc20Abi, functionName: 'name' })
      .catch(() => undefined),
  ]);
  return { address: getAddress(address), symbol, decimals: Number(decimals), name };
}

export async function findPool(
  tokenA: Address,
  tokenB: Address,
  fee: number,
): Promise<Address | null> {
  const pool = await client.readContract({
    address: ADDR.univ3Factory,
    abi: factoryAbi,
    functionName: 'getPool',
    args: [tokenA, tokenB, fee],
  });
  return pool === '0x0000000000000000000000000000000000000000' ? null : pool;
}

/** Probes every fee tier and returns the pools that actually exist. */
export async function findAllPools(
  tokenA: Address,
  tokenB: Address,
): Promise<{ fee: number; address: Address }[]> {
  const results = await serial(FEE_TIERS, async (fee) => {
    const address = await findPool(tokenA, tokenB, fee);
    return address ? { fee: fee as number, address } : null;
  });
  return results.filter(
    (r): r is { fee: number; address: Address } => r !== null,
  );
}

export async function loadPool(address: Address): Promise<PoolSnapshot> {
  const contract = { address, abi: poolAbi } as const;

  const [slot0, liquidity, fee, tickSpacing, token0Addr, token1Addr, blockNumber] =
    await Promise.all([
      client.readContract({ ...contract, functionName: 'slot0' }),
      client.readContract({ ...contract, functionName: 'liquidity' }),
      client.readContract({ ...contract, functionName: 'fee' }),
      client.readContract({ ...contract, functionName: 'tickSpacing' }),
      client.readContract({ ...contract, functionName: 'token0' }),
      client.readContract({ ...contract, functionName: 'token1' }),
      client.getBlockNumber(),
    ]);

  const [token0, token1] = await Promise.all([
    loadToken(token0Addr),
    loadToken(token1Addr),
  ]);

  const tick = Number(slot0[1]);
  const spacing = Number(tickSpacing);
  const { wordPos } = tickBitmapPosition(compressTick(tick, spacing));

  // 1st multicall: the bitmap window
  const wordPositions = Array.from(
    { length: WORD_WINDOW * 2 + 1 },
    (_, i) => wordPos - WORD_WINDOW + i,
  );
  const rawWords = await client.multicall({
    contracts: wordPositions.map((wp) => ({
      ...contract,
      functionName: 'tickBitmap' as const,
      args: [wp] as const,
    })),
    allowFailure: true,
  });

  const words = new Map<number, bigint>();
  const initializedTicks: number[] = [];
  wordPositions.forEach((wp, i) => {
    const r = rawWords[i];
    if (r.status !== 'success') return;
    const word = r.result as bigint;
    words.set(wp, word);
    if (word === 0n) return;
    for (let bit = 0; bit < 256; bit++) {
      if ((word >> BigInt(bit)) & 1n) initializedTicks.push((wp * 256 + bit) * spacing);
    }
  });

  // 2nd multicall: liquidityNet for every initialized tick in the window
  const ticks = new Map<number, bigint>();
  const CHUNK = 40;
  const chunks = Array.from(
    { length: Math.ceil(initializedTicks.length / CHUNK) },
    (_, i) => initializedTicks.slice(i * CHUNK, (i + 1) * CHUNK),
  );
  await serial(chunks, async (chunk) => {
    const raw = await client.multicall({
      contracts: chunk.map((t) => ({
        ...contract,
        functionName: 'ticks' as const,
        args: [t] as const,
      })),
      allowFailure: true,
    });
    chunk.forEach((t, i) => {
      const r = raw[i];
      if (r?.status !== 'success') return;
      ticks.set(t, (r.result as readonly unknown[])[1] as bigint);
    });
  });

  return {
    address: getAddress(address),
    token0,
    token1,
    fee: Number(fee),
    tickSpacing: spacing,
    sqrtPriceX96: slot0[0],
    tick,
    liquidity,
    words,
    ticks,
    blockNumber,
  };
}

export interface SwapResult {
  amountIn: bigint;
  amountOut: bigint;
  /** Ticks actually crossed — the tell that single-tick math would have lied. */
  ticksCrossed: number;
  sqrtPriceX96After: bigint;
  /** Signed bps: how much worse the average fill was than the spot price. */
  priceImpactBps: number;
  /** True when the prefetched window ran out before the trade did. */
  exhaustedWindow: boolean;
}

/**
 * Exact-input swap simulation. Mirrors UniswapV3Pool.swap, including the fee
 * taken per step and liquidity updates on tick crossings.
 */
export function simulateExactInput(
  pool: PoolSnapshot,
  amountIn: bigint,
  zeroForOne: boolean,
): SwapResult {
  const sqrtPriceLimitX96 = zeroForOne ? MIN_SQRT_RATIO + 1n : MAX_SQRT_RATIO - 1n;

  let amountRemaining = amountIn;
  let amountCalculated = 0n;
  let sqrtPriceX96 = pool.sqrtPriceX96;
  let tick = pool.tick;
  let liquidity = pool.liquidity;
  let ticksCrossed = 0;
  let exhaustedWindow = false;

  const spotBefore = sqrtPriceX96;

  while (amountRemaining > 0n && sqrtPriceX96 !== sqrtPriceLimitX96) {
    const { next, initialized } = nextInitializedTickWithinOneWord(
      pool.words,
      tick,
      pool.tickSpacing,
      zeroForOne,
    );

    let tickNext = next;
    if (tickNext < MIN_TICK) tickNext = MIN_TICK;
    if (tickNext > MAX_TICK) tickNext = MAX_TICK;

    // We only prefetched a window; stepping outside it means the result is a
    // lower bound on impact, so surface that rather than silently under-report.
    const { wordPos } = tickBitmapPosition(compressTick(tickNext, pool.tickSpacing));
    if (!pool.words.has(wordPos)) exhaustedWindow = true;

    const sqrtPriceNextX96 = getSqrtRatioAtTick(tickNext);

    const target = zeroForOne
      ? sqrtPriceNextX96 < sqrtPriceLimitX96
        ? sqrtPriceLimitX96
        : sqrtPriceNextX96
      : sqrtPriceNextX96 > sqrtPriceLimitX96
        ? sqrtPriceLimitX96
        : sqrtPriceNextX96;

    if (liquidity === 0n) {
      // No liquidity in this range — jump the gap without consuming input.
      sqrtPriceX96 = target;
      if (sqrtPriceX96 === sqrtPriceNextX96) {
        if (initialized) {
          const net = pool.ticks.get(tickNext) ?? 0n;
          liquidity += zeroForOne ? -net : net;
          ticksCrossed++;
        }
        tick = zeroForOne ? tickNext - 1 : tickNext;
      }
      if (exhaustedWindow) break;
      continue;
    }

    const step = computeSwapStep(sqrtPriceX96, target, liquidity, amountRemaining, pool.fee);

    sqrtPriceX96 = step.sqrtRatioNextX96;
    amountRemaining -= step.amountIn + step.feeAmount;
    amountCalculated += step.amountOut;

    if (sqrtPriceX96 === sqrtPriceNextX96) {
      if (initialized) {
        const net = pool.ticks.get(tickNext) ?? 0n;
        liquidity += zeroForOne ? -net : net;
        ticksCrossed++;
      }
      tick = zeroForOne ? tickNext - 1 : tickNext;
    } else {
      tick = tickFromSqrtPriceApprox(sqrtPriceX96);
    }

    if (exhaustedWindow) break;
  }

  const consumed = amountIn - amountRemaining;

  // Impact = how much worse the realised average price is than pre-trade spot.
  // Both are expressed as "input units paid per output unit", so the ratio is
  // directionless and always positive for a real trade.
  const s = Number(spotBefore) / Number(Q96);
  const spotRaw = s * s; // token1 raw per token0 raw
  const effective = Number(consumed) / Number(amountCalculated || 1n);
  const spotAsInputPerOutput = zeroForOne ? 1 / spotRaw : spotRaw;
  const priceImpactBps = Math.round((effective / spotAsInputPerOutput - 1) * 10_000);

  return {
    amountIn: consumed,
    amountOut: amountCalculated,
    ticksCrossed,
    sqrtPriceX96After: sqrtPriceX96,
    priceImpactBps,
    exhaustedWindow,
  };
}

/** Cheap tick recovery from a sqrt price — only used for loop bookkeeping. */
function tickFromSqrtPriceApprox(sqrtPriceX96: bigint): number {
  const ratio = Number(sqrtPriceX96) / Number(Q96);
  return Math.floor(Math.log(ratio * ratio) / Math.log(1.0001));
}

/**
 * Spot price of one whole token1 expressed in whole token0.
 * P_raw = amount1_raw / amount0_raw, so price = 10^(d1-d0) / P_raw.
 */
export function spotPrice(pool: PoolSnapshot): number {
  const r = Number(pool.sqrtPriceX96) / Number(Q96);
  const raw = r * r;
  return 10 ** (pool.token1.decimals - pool.token0.decimals) / raw;
}
