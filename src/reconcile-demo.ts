/**
 * `pnpm reconcile` — run the reference-market admission test over every xStock
 * on X Layer and print what it measured.
 *
 * This is a regression check, not a one-off migration tool. `ASSETS` in
 * src/fairvalue.ts is the set this test admitted; if a wrapper later stops
 * reconciling with the listing it claims to track, that is exactly the event the
 * oracle must not sleep through, so the script exits non-zero when an admitted
 * asset now fails. Same contract as `pnpm verify`.
 */
import { ASSETS, MEASURED, MEASURED_ON, MULTIPLIERS_MEASURED_ON } from './fairvalue';
import { quoteScaleCheck } from './issuer';
import { MAX_IDENTITY_BASIS_BPS, reconcileUniverse } from './reconcile';

const results = await reconcileUniverse();

console.log(
  `\n  Reference-market admission test — ${new Date().toISOString()}\n` +
    `  against the issuer's own mark, identity threshold ±${(MAX_IDENTITY_BASIS_BPS / 100).toFixed(0)}%\n`,
);
console.log(
  '  asset     underlying   issuer × shares    onchain     basis   session      verdict',
);
console.log('  ' + '─'.repeat(88));

for (const r of results) {
  const num = (v: number | undefined, d = 2) => (v == null ? '—' : v.toFixed(d));
  console.log(
    `  ${r.symbol.padEnd(9)} ` +
      `${(r.candidate ?? '—').padEnd(12)} ` +
      `${num(r.referencePrice).padStart(15)} ` +
      `${num(r.onchainPrice).padStart(10)} ` +
      `${(r.basisBps == null ? '—' : `${(r.basisBps / 100).toFixed(2)}%`).padStart(9)} ` +
      `${(r.issuer?.period ?? '—').padEnd(12)} ` +
      `${r.verdict === 'ADMIT' ? 'ADMIT' : `REJECT ${r.reason}`}`,
  );
}
console.log('  ' + '─'.repeat(88));

const admitted = results.filter((r) => r.verdict === 'ADMIT');
console.log(`\n  ${admitted.length} of ${results.length} admitted\n`);

// Converted prices must never be silently indistinguishable from native ones.
const converted = results.filter((r) => r.fxRate != null);
if (converted.length) {
  console.log(
    '  Converted through a live FX leg\n' +
      converted
        .map(
          (r) =>
            `      ${r.symbol.padEnd(9)} ${r.candidate} quoted in ${r.currency}, ` +
            `at ${r.fxRate!.toFixed(2)} ${r.currency}/USD`,
        )
        .join('\n') +
      '\n',
  );
}

// ------------------------------------------------------- the issuer's view
//
// A third opinion on the same quantity, printed next to the first two and used
// by nothing above. The question it answers: could Backed replace Yahoo as the
// reference leg, and does the corporate-action multiplier explain any of the
// basis we have been calling noise? See D62.

const observed = results.filter((r) => r.issuer);
if (observed.length) {
  console.log(
    `\n  The issuer's own view — Backed, ${observed.length} of ${results.length} resolved\n` +
      '  Observed only. No verdict above depends on any of it.\n',
  );
  // The two issuer endpoints publish the same price in different units. Prove
  // the scale every run against a name whose dollar price is unambiguous, rather
  // than trusting a constant that was right once.
  const scale = await quoteScaleCheck('AAPLx');
  if (scale) {
    const off = Math.abs(scale.ratio - 1) > 0.02;
    console.log(
      `  unit check  AAPLx quote mid ${scale.mid.toFixed(2)} vs price-data ` +
        `${scale.priceData.toFixed(2)} — ratio ${scale.ratio.toFixed(4)}` +
        (off ? '  ⚠️ SCALE HAS MOVED, the issuer column is not in dollars' : ' ✓') +
        '\n',
    );
  }

  console.log(
    '  asset     issuer     issuer mid    spread   session      mult   vs issuer    vs ref ×    vs ref ÷   closer',
  );
  console.log('  ' + '─'.repeat(110));
  for (const r of observed) {
    const i = r.issuer!;
    const n = (v: number | undefined, d = 2) => (v == null ? '—' : v.toFixed(d));
    const pct = (v: number | undefined) => (v == null ? '—' : `${(v / 100).toFixed(2)}%`);
    console.log(
      `  ${r.symbol.padEnd(9)} ` +
        `${i.symbol.padEnd(10)} ` +
        `${n(i.mid).padStart(10)} ` +
        `${(i.spreadBps == null ? '—' : `${i.spreadBps}bp`).padStart(8)} ` +
        `${(i.period ?? '—').padEnd(11)} ` +
        `${n(i.multiplier, 5).padStart(8)} ` +
        `${pct(i.basisBps).padStart(10)} ` +
        `${pct(i.multiplied).padStart(11)} ` +
        `${pct(i.divided).padStart(11)} ` +
        `${(i.closer ?? '—').padStart(6)}`,
    );
  }
  console.log('  ' + '─'.repeat(110));

  // The direction question, answered by counting rather than by reading docs.
  const moved = observed.filter((r) => r.issuer!.closer && r.issuer!.closer !== '—');
  if (moved.length) {
    const x = moved.filter((r) => r.issuer!.closer === 'x').length;
    const mean = (pick: (o: typeof moved[number]) => number | undefined) =>
      moved.reduce((s, r) => s + Math.abs(pick(r) ?? 0), 0) / moved.length;
    const mx = mean((r) => r.issuer!.multiplied);
    const md = mean((r) => r.issuer!.divided);
    // The per-asset vote is noisy where the multiplier is tiny: at 1.0009 the two
    // treatments differ by 9bp and the winner is whichever way the pool happens
    // to be leaning. The mean absolute basis is the better statistic because the
    // assets that carry real information — IBMx at 1.0204 — dominate it.
    console.log(
      `\n  Multiplier direction, across the ${moved.length} assets whose multiplier is not 1.0:\n` +
        `      per-asset vote        ${x} × versus ${moved.length - x} ÷\n` +
        `      mean |basis| × mult   ${(mx / 100).toFixed(2)}%\n` +
        `      mean |basis| ÷ mult   ${(md / 100).toFixed(2)}%\n` +
        `      untreated, for scale  ` +
        `${(mean((r) => r.basisBps) / 100).toFixed(2)}%`,
    );
  }

  // Whether the issuer could stand in for the reference at all. Two quotes for
  // the same security that disagree by more than the identity threshold would
  // end this line of enquiry immediately, so measure it before proposing it.
  const swappable = observed.filter(
    (r) => r.issuer!.basisBps != null && r.basisBps != null,
  );
  if (swappable.length) {
    const deltas = swappable
      .map((r) => ({
        symbol: r.symbol,
        d: Math.abs(r.issuer!.basisBps! - r.basisBps!),
      }))
      .sort((a, b) => a.d - b.d);
    const worst = deltas.at(-1)!;
    const median = deltas[Math.floor(deltas.length / 2)]!;
    console.log(
      `\n  Issuer vs Yahoo as a reference: median disagreement ${(median.d / 100).toFixed(2)}%, ` +
        `worst ${worst.symbol} at ${(worst.d / 100).toFixed(2)}%.` +
        `\n  Both are measured against the same on-chain price, so this is the cost of the swap.`,
    );
  }

  // The two assets ASSETS withholds are the interesting ones: the issuer quotes
  // a price for a security we refuse to price, which is a claim worth naming.
  const withheld = observed.filter(
    (r) => r.verdict === 'REJECT' && r.issuer!.mid != null,
  );
  if (withheld.length) {
    console.log(
      '\n  Quoted by the issuer, rejected by this test\n' +
        withheld
          .map(
            (r) =>
              `      ${r.symbol.padEnd(9)} issuer ${r.issuer!.mid!.toFixed(2)} USD  ` +
              `(${r.reason}) — the issuer has a mark where we have no defensible reference`,
          )
          .join('\n'),
    );
  }
  console.log('');
}

console.log('  Why each rejection stands\n');
for (const r of results) {
  if (r.verdict === 'ADMIT') continue;
  console.log(`  ${r.symbol.padEnd(9)} ${r.reason?.padEnd(13)} ${r.detail}`);
}

// The distribution behind MAX_IDENTITY_BASIS_BPS: the threshold is only
// defensible if admitted and rejected assets are separated by a gap far wider
// than the choice of cut. Print it rather than assert it.
const bases = results
  .filter((r) => r.basisBps != null)
  .map((r) => ({ symbol: r.symbol, abs: Math.abs(r.basisBps!) }))
  .sort((a, b) => a.abs - b.abs);
if (bases.length > 1) {
  const worstAdmitted = bases.filter((b) => b.abs <= MAX_IDENTITY_BASIS_BPS).at(-1);
  const bestRejected = bases.find((b) => b.abs > MAX_IDENTITY_BASIS_BPS);
  console.log(
    `\n  Widest reconciling basis  ${worstAdmitted?.symbol ?? '—'} ` +
      `${worstAdmitted ? (worstAdmitted.abs / 100).toFixed(1) + '%' : ''}\n` +
      `  Narrowest failing basis   ${bestRejected?.symbol ?? '— (nothing failed on basis)'} ` +
      `${bestRejected ? (bestRejected.abs / 100).toFixed(1) + '%' : ''}`,
  );
}

// ------------------------------------------------------------- regression

// Only assets carrying `admittedOn` are held to the test — wSKHYx and wSPCXx
// sit in ASSETS as recorded refusals, and a refusal failing the test is the
// test agreeing with itself, not a regression.
const recorded = new Map(ASSETS.filter((a) => a.admittedOn).map((a) => [a.symbol, a]));
const regressions = results.filter(
  (r) => recorded.has(r.symbol) && r.verdict === 'REJECT',
);
const newlyAdmitted = admitted.filter((r) => !recorded.has(r.symbol));

if (newlyAdmitted.length) {
  console.log(
    `\n  Admitted but not recorded in ASSETS: ${newlyAdmitted.map((r) => r.symbol).join(', ')}\n` +
      '  Add them to src/fairvalue.ts — the test says they can be defended.',
  );
}

// Every admitted asset must have recorded statistics, or it silently falls back
// to fitting live — which is the dependency this was supposed to remove, back
// again and invisible.
const unmeasured = [...recorded.keys()].filter((s) => !MEASURED[s]);
if (unmeasured.length) {
  console.log(
    `\n  ⚠️  Admitted but not in MEASURED: ${unmeasured.join(', ')}\n` +
      '      These fall back to a live regression against a year of daily bars.',
  );
}

// A recorded multiplier that no longer matches the issuer means a dividend or a
// split has landed since it was measured, and every fair value for that asset is
// wrong by the difference until it is re-recorded. Unlike signal drift, this one
// is not a matter of taste — it is a stale number being multiplied into a
// published price — so it prints as a warning rather than a note. The tolerance
// is the rounding in ASSETS (1e-6) with room to spare.
const MULTIPLIER_TOLERANCE = 5e-6;
const multiplierDrift = results.filter((r) => {
  const spec = recorded.get(r.symbol);
  const live = r.issuer?.multiplier;
  return spec?.multiplier != null && live != null &&
    Math.abs(live - spec.multiplier) > MULTIPLIER_TOLERANCE;
});
if (multiplierDrift.length) {
  console.log(
    `\n  ⚠️  Multiplier moved since ${MULTIPLIERS_MEASURED_ON} — re-record in src/fairvalue.ts\n` +
      multiplierDrift
        .map((r) => {
          const was = recorded.get(r.symbol)!.multiplier!;
          const now = r.issuer!.multiplier!;
          return (
            `      ${r.symbol.padEnd(9)} recorded ${was.toFixed(6)} → issuer ${now.toFixed(6)}  ` +
            `(${((now / was - 1) * 10_000).toFixed(1)}bp of fair value, on every publish)`
          );
        })
        .join('\n'),
  );
}

if (regressions.length) {
  console.log(
    `\n  ✗ ${regressions.length} admitted asset(s) no longer reconcile:\n` +
      regressions.map((r) => `      ${r.symbol}  ${r.reason}  ${r.detail}`).join('\n') +
      '\n\n  The oracle is publishing a fair value it can no longer defend. Fix before shipping.\n',
  );
  process.exit(1);
}

console.log(`\n  ✓ all ${recorded.size} admitted assets still reconcile\n`);
