/**
 * Runs the fair-value engine over the X Layer xStock universe and puts each
 * result next to the price the chain is actually quoting right now.
 */
import { parseUnits } from 'viem';
import { serial, USDG } from './chain';
import { ASSETS, computeFairValue, type FairValueReport } from './fairvalue';
import { checkExecution, DEFAULT_MANDATE } from './guard';
import { bestQuote, loadVenues, type Venue } from './planner';
import { addressBySymbol } from './pool';

const ADDRESS_BY_SYMBOL = await addressBySymbol();

const now = Math.floor(Date.now() / 1000);
console.log(`\n  FairValueOracle — ${new Date(now * 1000).toISOString()}\n`);
console.log(
  '  asset     reference   state              stale   fair value   ±band    onchain    basis   gap',
);
console.log('  ' + '─'.repeat(94));

const venuesBySymbol = new Map<string, Venue[]>();

const reports = await serial(ASSETS, async (spec) => {
  const address = ADDRESS_BY_SYMBOL.get(spec.symbol);
  let onchainPrice: number | undefined;
  if (address) {
    const venues = await loadVenues(address);
    venuesBySymbol.set(spec.symbol, venues);
    onchainPrice = venues[0]?.spot;
  }

  const r = await computeFairValue(spec, { now, onchainPrice });

  const stale =
    r.stalenessHours === Infinity ? '   —  ' : `${r.stalenessHours.toFixed(1)}h`;
  const fv = r.fairValue == null ? 'withheld' : r.fairValue.toFixed(2);
  const band = r.confidenceBps == null ? '  —  ' : `${(r.confidenceBps / 100).toFixed(2)}%`;
  const oc = onchainPrice == null ? '   —  ' : onchainPrice.toFixed(2);
  const basis = r.basisBps == null ? '   —  ' : `${(r.basisBps / 100).toFixed(2)}%`;

  console.log(
    `  ${spec.symbol.padEnd(9)} ` +
      `${(spec.reference ?? '—').padEnd(11)} ` +
      `${r.state.padEnd(17)} ` +
      `${stale.padStart(7)} ` +
      `${fv.padStart(12)} ` +
      `${band.padStart(7)} ` +
      `${oc.padStart(10)} ` +
      `${basis.padStart(8)} ` +
      `${String(r.gapRisk).padStart(5)}`,
  );
  return r;
});

console.log('  ' + '─'.repeat(94));

console.log('\n  How each fair value was carried forward\n');
for (const r of reports) {
  if (r.signals.length === 0) {
    console.log(`  ${r.symbol.padEnd(9)} ${r.notes.join('; ')}`);
    continue;
  }
  const parts = r.signals
    .map(
      (s) =>
        `${s.symbol} ${s.returnPct >= 0 ? '+' : ''}${s.returnPct.toFixed(2)}% ` +
        `× β${s.beta.toFixed(2)} (R²${s.r2.toFixed(2)}) → ${s.contributionBps >= 0 ? '+' : ''}${s.contributionBps.toFixed(0)}bp`,
    )
    .join('   ');
  console.log(`  ${r.symbol.padEnd(9)} ${parts}`);
  if (r.notes.length) console.log(`  ${''.padEnd(9)} ${r.notes.join('; ')}`);
}

console.log('\n  Gap-risk components (staleness / displacement / uncertainty / basis)\n');
for (const r of reports) {
  const p = r.gapRiskParts;
  const bar = (v: number) => '█'.repeat(Math.round(v * 10)).padEnd(10, '·');
  console.log(
    `  ${r.symbol.padEnd(9)} ${bar(p.staleness)} ${bar(p.displacement)} ` +
      `${bar(p.uncertainty)} ${bar(p.basis)}   = ${r.gapRisk}`,
  );
}
console.log();

// ------------------------------------------------------- execution guard

const TEST_NOTIONAL = Number(process.argv[2] ?? 2_000);
const amountIn = parseUnits(String(TEST_NOTIONAL), USDG.decimals);

console.log(
  `  PolicyGuard decision for a ${TEST_NOTIONAL.toLocaleString('en-US')} USDG buy\n` +
    `  mandate: gapRisk ≤ ${DEFAULT_MANDATE.maxGapRisk}, ` +
    `≤ ${DEFAULT_MANDATE.maxDeviationBps}bp from fair value (+band), ` +
    `≤ ${DEFAULT_MANDATE.maxImpactBps}bp impact\n`,
);

for (const r of reports as FairValueReport[]) {
  const venues = venuesBySymbol.get(r.symbol) ?? [];
  const q = venues.length ? bestQuote(venues, amountIn) : null;
  if (!q) {
    console.log(`  ${r.symbol.padEnd(9)} — no venue`);
    continue;
  }
  const d = checkExecution(r, q.effectivePrice, q.impactBps, DEFAULT_MANDATE, now);
  console.log(
    `  ${r.symbol.padEnd(9)} ${d.ok ? 'ALLOW ' : 'REJECT'}  ` +
      `${(d.reason ?? '').padEnd(15)} ${d.detail ?? `impact ${q.impactBps}bp, fill ${q.effectivePrice.toFixed(2)}`}`,
  );
}
console.log();
