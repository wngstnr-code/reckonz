/**
 * The demo that makes the case: a plausible thesis basket, executed naively,
 * versus the same basket sized to what X Layer can actually absorb.
 *
 * Thesis: "HBM memory supply stays tight for two more quarters, and the
 * beneficiaries are wider than NVIDIA alone."
 */
import { planBasket, type BasketTarget } from './planner';

const TOTAL_USDG = Number(process.argv[2] ?? 250_000);
const MAX_IMPACT_BPS = Number(process.argv[3] ?? 50); // 0.50% per leg

const thesis: BasketTarget[] = [
  { asset: '0xe2047ee3bddb5c99ae428ab83df63f8730698e30', weightBps: 2500 }, // wMUx
  { asset: '0x6215a58ed045d71f2561aaabe54f4c885c522998', weightBps: 2500 }, // wSKHYx
  { asset: '0x75e82e2884ea10f72fca777449b73377f4646219', weightBps: 2000 }, // wSNDKx
  { asset: '0xa8ddb5cd96b5222afe198316e9a57caa642850d5', weightBps: 2000 }, // wNVDAx
  { asset: '0x33aa35b0271fffe2048cc093ab7fe60931786719', weightBps: 1000 }, // wINTCx
];

const usd = (n: number) =>
  n.toLocaleString('en-US', { maximumFractionDigits: 0 });
const pct = (bps: number) => `${(bps / 100).toFixed(2)}%`;

console.log(`\n  Thesis basket — ${usd(TOTAL_USDG)} USDG, impact limit ${pct(MAX_IMPACT_BPS)}/leg`);
console.log(`  X Layer mainnet, live pool state\n`);

const plan = await planBasket(thesis, TOTAL_USDG, MAX_IMPACT_BPS);

console.log(
  '  asset      target  fee     naive $   impact  │  capacity   planned $  impact  slices',
);
console.log(
  '  ─────────────────────────────────────────────┼──────────────────────────────────────',
);

for (const l of plan.lines) {
  const naiveNotional = (TOTAL_USDG * l.targetBps) / 10_000;
  console.log(
    `  ${l.symbol.padEnd(9)} ` +
      `${(l.targetBps / 100).toFixed(0).padStart(5)}% ` +
      `${String(l.feeTier).padStart(5)} ` +
      `${usd(naiveNotional).padStart(10)} ` +
      `${pct(l.naiveImpactBps).padStart(8)}  │ ` +
      `${usd(l.capacityUsdg).padStart(9)} ` +
      `${usd(l.notional).padStart(10)} ` +
      `${pct(l.plannedImpactBps).padStart(7)} ` +
      `${String(l.slices).padStart(6)}` +
      (l.note ? `   ${l.note}` : ''),
  );
}

console.log(
  '  ─────────────────────────────────────────────┴──────────────────────────────────────',
);
console.log(`\n  Slippage cost, naive single-shot : ${usd(plan.naiveCost).padStart(10)} USDG`);
console.log(`  Slippage cost, planned           : ${usd(plan.plannedCost).padStart(10)} USDG`);
console.log(`  Saved                            : ${usd(plan.naiveCost - plan.plannedCost).padStart(10)} USDG` +
  `  (${(((plan.naiveCost - plan.plannedCost) / TOTAL_USDG) * 100).toFixed(2)}% of the basket)`);
if (plan.unallocated > 0) {
  console.log(
    `  Left in USDG (chain cannot absorb): ${usd(plan.unallocated).padStart(10)} USDG` +
      `  ← reported, not forced into the market`,
  );
}
console.log();
