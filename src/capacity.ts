/**
 * Capacity curve for the tokenised-equity universe on X Layer.
 *
 * This is the number that decides whether a product on top of xStocks is a
 * fund or a tool: how much USDG each asset can absorb before slippage passes
 * a given threshold. Computed from live pool state, not from TVL.
 */
import { formatUnits } from 'viem';
import { serial, XSTOCK_SEEDS } from './chain';
import { capacity, loadVenues } from './planner';

const LIMITS = [50, 100, 200, 500]; // bps

const usd = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });

console.log('\n  Absorbable USDG before price impact exceeds the limit');
console.log('  X Layer mainnet, live Uniswap V3 state\n');
console.log(
  '  asset       spot        ' + LIMITS.map((l) => `${(l / 100).toFixed(2)}%`.padStart(10)).join(''),
);
console.log('  ' + '─'.repeat(24 + LIMITS.length * 10));

const totals = new Array(LIMITS.length).fill(0);

await serial(XSTOCK_SEEDS, async (asset) => {
  const venues = await loadVenues(asset);
  if (venues.length === 0) {
    console.log(`  ${asset.slice(0, 10)}…  no USDG pool`);
    return;
  }
  const symbol = venues[0]!.asset.symbol;
  const spot = venues[0]!.spot;

  const caps = LIMITS.map((limit) =>
    Number(formatUnits(capacity(venues, limit), 6)),
  );
  caps.forEach((c, i) => (totals[i] += c));

  console.log(
    `  ${symbol.padEnd(10)} ${spot.toFixed(2).padStart(9)}  ` +
      caps.map((c) => usd(c).padStart(10)).join(''),
  );
});

console.log('  ' + '─'.repeat(24 + LIMITS.length * 10));
console.log(
  `  ${'TOTAL'.padEnd(20)}  ` + totals.map((t) => usd(t).padStart(10)).join(''),
);
console.log(
  `\n  Read this as the ceiling on any AUM-based product here — and as the\n` +
    `  reason execution quality, not asset gathering, is the thing worth selling.\n`,
);
