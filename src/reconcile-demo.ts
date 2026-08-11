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
import { ASSETS } from './fairvalue';
import { MAX_IDENTITY_BASIS_BPS, MIN_ALIGNED_DAYS, reconcileUniverse } from './reconcile';

const results = await reconcileUniverse();

console.log(
  `\n  Reference-market admission test — ${new Date().toISOString()}\n` +
    `  identity threshold ±${(MAX_IDENTITY_BASIS_BPS / 100).toFixed(0)}%, ` +
    `minimum ${MIN_ALIGNED_DAYS} aligned days\n`,
);
console.log(
  '  asset     candidate    ccy    reference    onchain     basis   signal    R²   verdict',
);
console.log('  ' + '─'.repeat(94));

for (const r of results) {
  const best = r.fits[0];
  const num = (v: number | undefined, d = 2) => (v == null ? '—' : v.toFixed(d));
  console.log(
    `  ${r.symbol.padEnd(9)} ` +
      `${(r.candidate ?? '—').padEnd(12)} ` +
      `${(r.currency ?? '—').padEnd(6)} ` +
      `${num(r.referencePrice).padStart(10)} ` +
      `${num(r.onchainPrice).padStart(10)} ` +
      `${(r.basisBps == null ? '—' : `${(r.basisBps / 100).toFixed(1)}%`).padStart(9)} ` +
      `${(best?.symbol ?? '—').padEnd(9)} ` +
      `${num(best?.r2).padStart(5)}  ` +
      `${r.verdict === 'ADMIT' ? 'ADMIT' : `REJECT ${r.reason}`}`,
  );
}
console.log('  ' + '─'.repeat(94));

const admitted = results.filter((r) => r.verdict === 'ADMIT');
console.log(`\n  ${admitted.length} of ${results.length} admitted\n`);

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

// Signal drift is not a defect: the best carry-forward instrument for a name
// can genuinely change. It is worth surfacing so the choice stays measured
// rather than inherited.
const drifted = results.filter((r) => {
  const spec = recorded.get(r.symbol);
  return spec && r.fits[0] && spec.signals[0] !== r.fits[0].symbol;
});
if (drifted.length) {
  console.log(
    '\n  Signal now fits better elsewhere (not a failure — re-record when convenient)\n' +
      drifted
        .map(
          (r) =>
            `      ${r.symbol.padEnd(9)} recorded ${recorded.get(r.symbol)!.signals[0]} → ` +
            `${r.fits[0]!.symbol} (R² ${r.fits[0]!.r2.toFixed(2)})`,
        )
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
