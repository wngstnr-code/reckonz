/**
 * Capacity curve for the tokenised-equity universe on X Layer.
 *
 * This is the number that decides whether a product on top of xStocks is a
 * fund or a tool: how much USDG each asset can absorb before slippage passes
 * a given threshold. Computed from live pool state, not from TVL.
 */
import { formatUnits } from 'viem';
import { serial, XSTOCKS } from './chain';
import { capacityDetail, loadVenues } from './planner';

const LIMITS = [50, 100, 200, 500]; // bps

const usd = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });

let anyPoolLimited = false;

console.log('\n  Absorbable USDG before price impact exceeds the limit');
console.log('  X Layer mainnet, live Uniswap V3 state');
console.log('  One venue per asset: the USDG pool, in-range liquidity only\n');
console.log(
  '  asset       spot        ' + LIMITS.map((l) => `${(l / 100).toFixed(2)}%`.padStart(10)).join(''),
);
console.log('  ' + '─'.repeat(24 + LIMITS.length * 10));

const totals = new Array(LIMITS.length).fill(0);

await serial(XSTOCKS, async (asset) => {
  const venues = await loadVenues(asset);
  if (venues.length === 0) {
    console.log(`  ${asset.slice(0, 10)}…  no USDG pool`);
    return;
  }
  const symbol = venues[0]!.asset.symbol;
  const spot = venues[0]!.spot;

  const caps = LIMITS.map((limit) => capacityDetail(venues, limit));
  caps.forEach((c, i) => (totals[i] += Number(formatUnits(c.size, 6))));
  if (caps.some((c) => c.poolLimited)) anyPoolLimited = true;

  console.log(
    `  ${symbol.padEnd(10)} ${spot.toFixed(2).padStart(9)}  ` +
      caps
        .map((c) => {
          const n = Number(formatUnits(c.size, 6));
          // The marker is the difference between "this is what the limit costs
          // you" and "this is all there is". Two columns that tie on a marked
          // row are one pool emptying twice, not a market refusing to deepen.
          return (usd(n) + (c.poolLimited ? '*' : ' ')).padStart(10);
        })
        .join(''),
  );
});

console.log('  ' + '─'.repeat(24 + LIMITS.length * 10));
console.log(
  `  ${'TOTAL'.padEnd(20)}  ` + totals.map((t) => usd(t).padStart(10)).join(''),
);
if (anyPoolLimited) {
  console.log(
    `\n  * the USDG pool ran dry before the limit was reached, so this is that\n` +
      `    pool's depth, not a measured impact. The asset can be deeper than the\n` +
      `    number: other quote currencies are not counted here. See D103.`,
  );
}

console.log(
  `\n  Read this as the ceiling on any AUM-based product here — and as the\n` +
    `  reason execution quality, not asset gathering, is the thing worth selling.\n`,
);
