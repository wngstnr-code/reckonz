/**
 * Sanity harness: proves the ported math agrees with the chain before any
 * planning decision is built on top of it.
 */
import { formatUnits, parseUnits } from 'viem';
import { USDG } from './chain';
import { loadPool, simulateExactInput, spotPrice } from './pool';
import { getSqrtRatioAtTick } from './v3math';

const WSPYX_USDG_500 = '0x07c40850d14064d20eb0afdef9574675392f2c11';

const pool = await loadPool(WSPYX_USDG_500);

console.log(`pool     ${pool.address}  block ${pool.blockNumber}`);
console.log(`pair     ${pool.token0.symbol}(${pool.token0.decimals}) / ${pool.token1.symbol}(${pool.token1.decimals})  fee ${pool.fee}  spacing ${pool.tickSpacing}`);
console.log(`tick     ${pool.tick}   activeLiquidity ${pool.liquidity}`);
console.log(`window   ${pool.words.size} bitmap words, ${pool.ticks.size} initialised ticks`);

// 1) TickMath must reproduce the on-chain sqrt price from the on-chain tick.
const fromTick = getSqrtRatioAtTick(pool.tick);
const drift = Number(pool.sqrtPriceX96 - fromTick) / Number(pool.sqrtPriceX96);
console.log(`\n[1] TickMath  slot0=${pool.sqrtPriceX96}  fromTick=${fromTick}  drift=${(drift * 100).toFixed(6)}%`);
console.log(`    ${Math.abs(drift) < 1e-4 ? 'PASS — within one tick as expected' : 'FAIL'}`);

// 2) Spot price must look like a real S&P 500 quote.
const spot = spotPrice(pool);
console.log(`\n[2] Spot      1 ${pool.token1.symbol} = ${spot.toFixed(2)} ${pool.token0.symbol}`);

// 3) Multi-tick simulation across a size ladder.
const isUsdgToken0 = pool.token0.address.toLowerCase() === USDG.address.toLowerCase();
const zeroForOne = isUsdgToken0; // paying USDG, receiving the equity
console.log(`\n[3] Exact-input ladder (buying ${pool.token1.symbol} with ${pool.token0.symbol})\n`);
console.log('      notional      out          eff. price     impact   ticks  window');
console.log('    ─────────────────────────────────────────────────────────────────────');

for (const usd of [1_000, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000]) {
  const amountIn = parseUnits(String(usd), USDG.decimals);
  const r = simulateExactInput(pool, amountIn, zeroForOne);
  const out = Number(formatUnits(r.amountOut, pool.token1.decimals));
  const eff = usd / out;
  console.log(
    `    ${usd.toLocaleString('en-US').padStart(10)}  ` +
      `${out.toFixed(3).padStart(10)}  ` +
      `${eff.toFixed(2).padStart(12)}  ` +
      `${(r.priceImpactBps / 100).toFixed(2).padStart(7)}%  ` +
      `${String(r.ticksCrossed).padStart(5)}  ` +
      `${r.exhaustedWindow ? 'EXHAUSTED' : 'ok'}`,
  );
}

console.log(
  `\n    Single-tick approximation said 5.92% at 50k. Anything above that here is\n` +
    `    liquidity the naive model invented.`,
);
