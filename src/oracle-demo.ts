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

// Nothing is carried forward any more — the issuer marks the token live, so the
// oracle reads rather than predicts (D62). What is worth printing is where each
// number came from and how wide it is, which is what the notes now say.
console.log('\n  Where each fair value came from\n');
for (const r of reports) {
  console.log(`  ${r.symbol.padEnd(9)} ${r.notes.join('; ') || '—'}`);
}

console.log(
  '\n  Gap-risk components (not quoting / open gap / band / basis)\n\n' +
    '  The second column is what the position is exposed to at the open, and it stays in\n' +
    '  the score while the mark is live — a good price at 3am still carries the gap.\n',
);
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
