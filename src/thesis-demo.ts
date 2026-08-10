/**
 * End to end: free text → compiled thesis → assets that exist on X Layer →
 * depth-aware sizing → a mandate whose exit triggers came out of the same
 * compilation as the entry.
 */
import type { Address } from 'viem';
import { serial, XSTOCK_SEEDS } from './chain';
import { loadToken } from './pool';
import { planBasket, type BasketTarget } from './planner';
import { compileMandate, describeTrigger } from './thesis';
import { pickProvider } from './provider';

const THESIS_TEXT =
  process.argv[2] ??
  'I think HBM memory supply stays tight for two more quarters, and the beneficiaries are wider than NVIDIA alone.';
const TOTAL_USDG = Number(process.env.NOTIONAL ?? 250_000);
const MAX_IMPACT_BPS = Number(process.env.MAX_IMPACT_BPS ?? 50);

const { provider, label } = pickProvider();

console.log(`\n  Thesis Compiler`);
console.log(`  provider: ${label}\n`);
console.log(`  input: "${THESIS_TEXT}"\n`);

// 1 — compile
const thesis = await provider.compile(THESIS_TEXT);

console.log(`  claim     ${thesis.claim}`);
console.log(`  horizon   ${thesis.horizonDays} days\n`);
console.log('  causal chain');
thesis.causalChain.forEach((s, i) => console.log(`    ${i + 1}. ${s}`));

console.log('\n  beneficiaries');
for (const b of thesis.beneficiaries) {
  console.log(
    `    ${b.entity.padEnd(12)} ${b.order.padEnd(10)} conf ${b.confidence.toFixed(2)}  ${b.rationale}`,
  );
  console.log(`    ${''.padEnd(12)} evidence: ${b.evidence}`);
}

// 2 — discover what is actually investable, on-chain
console.log('\n  discovering investable universe on X Layer…');
const universe = await serial(XSTOCK_SEEDS, async (a: Address) => {
  const t = await loadToken(a);
  return { symbol: t.symbol, name: t.name, address: t.address };
});
console.log(`  found ${universe.length}: ${universe.map((u) => u.symbol).join(', ')}`);

// 3 — map the thesis onto it
const allocation = await provider.allocate(thesis, universe);

console.log('\n  allocation');
for (const leg of allocation.legs) {
  console.log(
    `    ${leg.symbol.padEnd(9)} ${(leg.weightBps / 100).toFixed(0).padStart(3)}%  ` +
      `expresses ${leg.expresses.padEnd(11)} ${leg.rationale}`,
  );
}
for (const u of allocation.unmapped) {
  console.log(`    ${'—'.padEnd(9)}   —   ${u.entity}: ${u.reason}`);
}

// 4 — the mandate, derived from the same compilation
const mandate = compileMandate(thesis, allocation);

console.log('\n  exit triggers compiled from the disconfirming conditions');
for (const t of mandate.exitTriggers) {
  console.log(`    ${t.unresolved.length ? '⚠' : '✓'} ${describeTrigger(t)}`);
  if (t.unresolved.length) {
    console.log(
      `      not covered — no leg expresses: ${t.unresolved.join(', ')}`,
    );
  }
}
if (mandate.manualWatch.length) {
  console.log('\n  not measurable by this system — surfaced, not silently dropped');
  for (const m of mandate.manualWatch) console.log(`    ! ${m}`);
}
if (mandate.maxGapRisk !== undefined) {
  console.log(`\n  implied maxGapRisk: ${mandate.maxGapRisk}`);
}

console.log('\n  unstated assumptions');
for (const a of thesis.unstatedAssumptions) console.log(`    · ${a}`);

// 5 — what the chain can actually absorb
const bySymbol = new Map(universe.map((u) => [u.symbol, u.address]));
const targets: BasketTarget[] = allocation.legs
  .filter((l) => bySymbol.has(l.symbol))
  .map((l) => ({ asset: bySymbol.get(l.symbol)!, weightBps: l.weightBps }));

console.log(
  `\n  sizing ${TOTAL_USDG.toLocaleString('en-US')} USDG against live depth (limit ${(MAX_IMPACT_BPS / 100).toFixed(2)}%/leg)…\n`,
);
const plan = await planBasket(targets, TOTAL_USDG, MAX_IMPACT_BPS);

const usd = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });
console.log('    asset      thesis $   naive impact  │  capacity   executable $');
console.log('    ───────────────────────────────────┼───────────────────────────');
for (const l of plan.lines) {
  console.log(
    `    ${l.symbol.padEnd(9)} ${usd((TOTAL_USDG * l.targetBps) / 10_000).padStart(9)} ` +
      `${(l.naiveImpactBps / 100).toFixed(2).padStart(9)}%  │ ` +
      `${usd(l.capacityUsdg).padStart(9)} ${usd(l.notional).padStart(12)}`,
  );
}
console.log(
  `\n    The thesis is coherent at ${usd(TOTAL_USDG)} USDG. X Layer can express ` +
    `${usd(TOTAL_USDG - plan.unallocated)} of it.\n`,
);
