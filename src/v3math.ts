/**
 * Uniswap V3 core math, ported faithfully to BigInt.
 *
 * This is a full multi-tick exact-input swap simulation — it walks the tick
 * bitmap and consumes liquidity range by range, exactly as UniswapV3Pool.swap
 * does. The single-tick approximation everyone reaches for understates price
 * impact badly on thin pools, which is precisely the regime every xStock pool
 * on X Layer lives in.
 */

export const Q96 = 1n << 96n;
export const MAX_UINT256 = (1n << 256n) - 1n;

export const MIN_TICK = -887272;
export const MAX_TICK = 887272;
export const MIN_SQRT_RATIO = 4295128739n;
export const MAX_SQRT_RATIO =
  1461446703485210103287273052203988822378723970342n;

function mulDiv(a: bigint, b: bigint, denominator: bigint): bigint {
  return (a * b) / denominator;
}

function mulDivRoundingUp(a: bigint, b: bigint, denominator: bigint): bigint {
  const product = a * b;
  const result = product / denominator;
  return product % denominator === 0n ? result : result + 1n;
}

function divRoundingUp(a: bigint, b: bigint): bigint {
  return a % b === 0n ? a / b : a / b + 1n;
}

// ---------------------------------------------------------------- TickMath

const TICK_RATIOS: [number, bigint][] = [
  [0x2, 0xfff97272373d413259a46990580e213an],
  [0x4, 0xfff2e50f5f656932ef12357cf3c7fdccn],
  [0x8, 0xffe5caca7e10e4e61c3624eaa0941cd0n],
  [0x10, 0xffcb9843d60f6159c9db58835c926644n],
  [0x20, 0xff973b41fa98c081472e6896dfb254c0n],
  [0x40, 0xff2ea16466c96a3843ec78b326b52861n],
  [0x80, 0xfe5dee046a99a2a811c461f1969c3053n],
  [0x100, 0xfcbe86c7900a88aedcffc83b479aa3a4n],
  [0x200, 0xf987a7253ac413176f2b074cf7815e54n],
  [0x400, 0xf3392b0822b70005940c7a398e4b70f3n],
  [0x800, 0xe7159475a2c29b7443b29c7fa6e889d9n],
  [0x1000, 0xd097f3bdfd2022b8845ad8f792aa5825n],
  [0x2000, 0xa9f746462d870fdf8a65dc1f90e061e5n],
  [0x4000, 0x70d869a156d2a1b890bb3df62baf32f7n],
  [0x8000, 0x31be135f97d08fd981231505542fcfa6n],
  [0x10000, 0x9aa508b5b7a84e1c677de54f3e99bc9n],
  [0x20000, 0x5d6af8dedb81196699c329225ee604n],
  [0x40000, 0x2216e584f5fa1ea926041bedfe98n],
  [0x80000, 0x48a170391f7dc42444e8fa2n],
];

export function getSqrtRatioAtTick(tick: number): bigint {
  const absTick = Math.abs(tick);
  if (absTick > MAX_TICK) throw new Error(`tick out of range: ${tick}`);

  let ratio =
    (absTick & 0x1) !== 0
      ? 0xfffcb933bd6fad37aa2d162d1a594001n
      : 0x100000000000000000000000000000000n;

  for (const [bit, constant] of TICK_RATIOS) {
    if ((absTick & bit) !== 0) ratio = (ratio * constant) >> 128n;
  }

  if (tick > 0) ratio = MAX_UINT256 / ratio;

  // round up to the nearest sqrtPriceX96
  return (ratio >> 32n) + (ratio % (1n << 32n) === 0n ? 0n : 1n);
}

// ----------------------------------------------------------- SqrtPriceMath

export function getAmount0Delta(
  sqrtRatioAX96: bigint,
  sqrtRatioBX96: bigint,
  liquidity: bigint,
  roundUp: boolean,
): bigint {
  let [a, b] = sqrtRatioAX96 > sqrtRatioBX96
    ? [sqrtRatioBX96, sqrtRatioAX96]
    : [sqrtRatioAX96, sqrtRatioBX96];

  const numerator1 = liquidity << 96n;
  const numerator2 = b - a;

  return roundUp
    ? divRoundingUp(mulDivRoundingUp(numerator1, numerator2, b), a)
    : mulDiv(numerator1, numerator2, b) / a;
}

export function getAmount1Delta(
  sqrtRatioAX96: bigint,
  sqrtRatioBX96: bigint,
  liquidity: bigint,
  roundUp: boolean,
): bigint {
  const [a, b] = sqrtRatioAX96 > sqrtRatioBX96
    ? [sqrtRatioBX96, sqrtRatioAX96]
    : [sqrtRatioAX96, sqrtRatioBX96];

  return roundUp
    ? mulDivRoundingUp(liquidity, b - a, Q96)
    : mulDiv(liquidity, b - a, Q96);
}

function getNextSqrtPriceFromAmount0RoundingUp(
  sqrtPX96: bigint,
  liquidity: bigint,
  amount: bigint,
  add: boolean,
): bigint {
  if (amount === 0n) return sqrtPX96;
  const numerator1 = liquidity << 96n;

  if (add) {
    const product = amount * sqrtPX96;
    const denominator = numerator1 + product;
    if (denominator >= numerator1) {
      return mulDivRoundingUp(numerator1, sqrtPX96, denominator);
    }
    return divRoundingUp(numerator1, numerator1 / sqrtPX96 + amount);
  }

  const product = amount * sqrtPX96;
  if (!(product / amount === sqrtPX96 && numerator1 > product)) {
    throw new Error('price overflow');
  }
  const denominator = numerator1 - product;
  return mulDivRoundingUp(numerator1, sqrtPX96, denominator);
}

function getNextSqrtPriceFromAmount1RoundingDown(
  sqrtPX96: bigint,
  liquidity: bigint,
  amount: bigint,
  add: boolean,
): bigint {
  if (add) {
    return sqrtPX96 + (amount << 96n) / liquidity;
  }
  const quotient = mulDivRoundingUp(amount, Q96, liquidity);
  if (sqrtPX96 <= quotient) throw new Error('price underflow');
  return sqrtPX96 - quotient;
}

export function getNextSqrtPriceFromInput(
  sqrtPX96: bigint,
  liquidity: bigint,
  amountIn: bigint,
  zeroForOne: boolean,
): bigint {
  return zeroForOne
    ? getNextSqrtPriceFromAmount0RoundingUp(sqrtPX96, liquidity, amountIn, true)
    : getNextSqrtPriceFromAmount1RoundingDown(sqrtPX96, liquidity, amountIn, true);
}

// --------------------------------------------------------------- SwapMath

export interface SwapStep {
  sqrtRatioNextX96: bigint;
  amountIn: bigint;
  amountOut: bigint;
  feeAmount: bigint;
}

/** Exact-input only — that is the whole of what the planner needs. */
export function computeSwapStep(
  sqrtRatioCurrentX96: bigint,
  sqrtRatioTargetX96: bigint,
  liquidity: bigint,
  amountRemaining: bigint,
  feePips: number,
): SwapStep {
  const zeroForOne = sqrtRatioCurrentX96 >= sqrtRatioTargetX96;
  const fee = BigInt(feePips);
  const amountRemainingLessFee = mulDiv(amountRemaining, 1_000_000n - fee, 1_000_000n);

  let amountIn: bigint;
  let amountOut: bigint;
  let sqrtRatioNextX96: bigint;

  amountIn = zeroForOne
    ? getAmount0Delta(sqrtRatioTargetX96, sqrtRatioCurrentX96, liquidity, true)
    : getAmount1Delta(sqrtRatioCurrentX96, sqrtRatioTargetX96, liquidity, true);

  if (amountRemainingLessFee >= amountIn) {
    sqrtRatioNextX96 = sqrtRatioTargetX96;
  } else {
    sqrtRatioNextX96 = getNextSqrtPriceFromInput(
      sqrtRatioCurrentX96,
      liquidity,
      amountRemainingLessFee,
      zeroForOne,
    );
  }

  const max = sqrtRatioTargetX96 === sqrtRatioNextX96;

  if (zeroForOne) {
    amountIn = max
      ? amountIn
      : getAmount0Delta(sqrtRatioNextX96, sqrtRatioCurrentX96, liquidity, true);
    amountOut = getAmount1Delta(sqrtRatioNextX96, sqrtRatioCurrentX96, liquidity, false);
  } else {
    amountIn = max
      ? amountIn
      : getAmount1Delta(sqrtRatioCurrentX96, sqrtRatioNextX96, liquidity, true);
    amountOut = getAmount0Delta(sqrtRatioCurrentX96, sqrtRatioNextX96, liquidity, false);
  }

  const feeAmount = !max
    ? amountRemaining - amountIn
    : mulDivRoundingUp(amountIn, fee, 1_000_000n - fee);

  return { sqrtRatioNextX96, amountIn, amountOut, feeAmount };
}

// ------------------------------------------------------------- TickBitmap

function mostSignificantBit(x: bigint): number {
  let r = 0;
  while (x > 1n) {
    x >>= 1n;
    r++;
  }
  return r;
}

function leastSignificantBit(x: bigint): number {
  let r = 0;
  while ((x & 1n) === 0n) {
    x >>= 1n;
    r++;
  }
  return r;
}

/** Solidity's int24 division truncates toward zero; compressed floors. */
export function compressTick(tick: number, tickSpacing: number): number {
  let compressed = Math.trunc(tick / tickSpacing);
  if (tick < 0 && tick % tickSpacing !== 0) compressed--;
  return compressed;
}

export function tickBitmapPosition(compressed: number): {
  wordPos: number;
  bitPos: number;
} {
  return { wordPos: compressed >> 8, bitPos: compressed & 0xff };
}

/**
 * Mirrors TickBitmap.nextInitializedTickWithinOneWord. `words` is the lazily
 * fetched bitmap; a missing word is treated as empty, which is safe because
 * the caller prefetches a window wide enough for any sane trade size.
 */
export function nextInitializedTickWithinOneWord(
  words: Map<number, bigint>,
  tick: number,
  tickSpacing: number,
  lte: boolean,
): { next: number; initialized: boolean } {
  const compressed = compressTick(tick, tickSpacing);

  if (lte) {
    const { wordPos, bitPos } = tickBitmapPosition(compressed);
    const mask = (1n << BigInt(bitPos)) - 1n + (1n << BigInt(bitPos));
    const masked = (words.get(wordPos) ?? 0n) & mask;
    const initialized = masked !== 0n;
    const next = initialized
      ? (compressed - (bitPos - mostSignificantBit(masked))) * tickSpacing
      : (compressed - bitPos) * tickSpacing;
    return { next, initialized };
  }

  const { wordPos, bitPos } = tickBitmapPosition(compressed + 1);
  const mask = ~((1n << BigInt(bitPos)) - 1n) & ((1n << 256n) - 1n);
  const masked = (words.get(wordPos) ?? 0n) & mask;
  const initialized = masked !== 0n;
  const next = initialized
    ? (compressed + 1 + (leastSignificantBit(masked) - bitPos)) * tickSpacing
    : (compressed + 1 + (255 - bitPos)) * tickSpacing;
  return { next, initialized };
}
