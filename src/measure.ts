/**
 * `pnpm measure` — re-derive what `src/fairvalue.ts` records, from our own data.
 *
 * Two things are recorded rather than fetched at publish time, for the same
 * reason: the oracle must not need somebody else's uptime to price anything.
 *
 *   `multiplier`  shares per token, moves on dividend and split dates
 *   `MEASURED`    the close-to-open jump σ behind the band when nobody quotes
 *
 * The first is read straight from the issuer and is always available. The
 * second used to come from Yahoo, and **does not any more** — it comes from
 * `observations/`, the store `pnpm sample` builds out of the issuer's own
 * marks. That was the last thing tying this repo to a source it has no licence
 * to use, and D62 closed it by building the history instead of borrowing it.
 *
 * The honest consequence: a store that has not watched enough session
 * boundaries cannot produce a σ, and this script **says so instead of deriving
 * one from a short series**. A confident number from six hours of samples would
 * be worse than the stale one it replaced, because it would look fresh.
 *
 *   pnpm measure                # report drift, print what to paste
 *   pnpm measure --multipliers  # multipliers only, no store needed
 */
import { ASSETS, MEASURED, MEASURED_ON, MULTIPLIERS_MEASURED_ON } from './fairvalue';
import { multiplierFor } from './issuer';
import { coverage, jumps, readAll, STORE } from './observations';
import { serial } from './chain';

const ONLY_MULTIPLIERS = process.argv.includes('--multipliers');

/**
 * Jumps needed before a σ is worth publishing a band from.
 *
 * `gapStats` used to refuse under five, which was the right instinct at the
 * wrong scale: five weeknights is a week and tells you very little about a
 * security that gaps quarterly. Thirty is roughly six weeks of weeknights, and
 * is the point at which a standard deviation stops moving materially when one
 * more observation lands.
 */
const MIN_JUMPS = 30;

// ------------------------------------------------------------- multipliers

console.log(`\n  Multipliers — recorded ${MULTIPLIERS_MEASURED_ON}\n`);

const multRows: string[] = [];
const multDrift: string[] = [];
const live = await serial(ASSETS, async (a) => ({
  spec: a,
  m: await multiplierFor(a.symbol.replace(/^w/, '')),
}));

for (const { spec, m } of live) {
  if (!m) {
    multDrift.push(`      ${spec.symbol.padEnd(9)} could not be read — leaving the recorded value alone`);
    continue;
  }
  const now = Number(m.current.toFixed(6));
  const was = spec.multiplier;
  if (was != null && Math.abs(now - was) > 5e-6) {
    multDrift.push(
      `      ${spec.symbol.padEnd(9)} ${was.toFixed(6)} → ${now.toFixed(6)}  ` +
        `(${((now / was - 1) * 10_000).toFixed(1)}bp of fair value, on every publish)` +
        (m.reason ? `  [${m.reason}]` : ''),
    );
  }
  multRows.push(`  ${spec.symbol.padEnd(9)} multiplier: ${now}`);
}

if (multDrift.length) {
  console.log('  Moved since they were recorded — update src/fairvalue.ts\n' + multDrift.join('\n') + '\n');
} else {
  console.log('  Nothing has moved.\n');
}

if (ONLY_MULTIPLIERS) {
  console.log(multRows.join('\n') + '\n');
  process.exit(multDrift.length ? 1 : 0);
}

// ------------------------------------------------------------ gap statistics

console.log(`  Gap σ — recorded ${MEASURED_ON}, derived from ${STORE}\n`);

const samples = readAll();
if (samples.length === 0) {
  console.log(
    '  The store is empty. Nothing to derive from, and nothing is being guessed.\n\n' +
      '  Start it with `TARGET=mainnet pnpm sample --loop`, ideally on the same box as\n' +
      '  the publish worker. Until it has watched real session boundaries, the recorded\n' +
      `  σ from ${MEASURED_ON} stays in force — stale, dated, and visible.\n`,
  );
  process.exit(0);
}

const cov = coverage(samples);
const ready: string[] = [];
const notReady: string[] = [];

for (const c of cov) {
  const js = jumps(samples, c.symbol);
  if (js.length < MIN_JUMPS) {
    notReady.push(
      `      ${c.symbol.padEnd(9)} ${String(js.length).padStart(3)}/${MIN_JUMPS} jumps  ` +
        `(${c.samples} marks, ${c.boundaries} boundaries watched)`,
    );
    continue;
  }
  const mean = js.reduce((a, b) => a + b, 0) / js.length;
  const sd = Math.sqrt(js.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (js.length - 1));
  const was = MEASURED[c.symbol]?.gaps.overnightSd;
  const rel = was ? sd / was - 1 : null;
  ready.push(
    `  ${c.symbol.padEnd(9)} σ ${(sd * 100).toFixed(2)}%  from ${js.length} jumps` +
      (rel == null
        ? '  (nothing recorded to compare)'
        : `  — recorded ${(was! * 100).toFixed(2)}%, ${rel > 0 ? '+' : ''}${(rel * 100).toFixed(0)}%`),
  );
}

if (ready.length) {
  console.log('  Ready to replace the recorded value\n' + ready.join('\n') + '\n');
}
if (notReady.length) {
  console.log(
    `  Not enough history yet — the recorded σ from ${MEASURED_ON} stays in force\n` +
      notReady.slice(0, 8).join('\n') +
      (notReady.length > 8 ? `\n      …and ${notReady.length - 8} more` : '') +
      '\n\n  This is the honest state, not a failure. A σ from a short series would look\n' +
      '  fresher than the one it replaced and be worse.\n',
  );
}
