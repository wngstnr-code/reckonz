/**
 * Record the run the console shows, and print what it will say.
 *
 *     GEMINI_API_KEY=… pnpm showcase
 *     GEMINI_API_KEY=… pnpm showcase "your thesis here" 250000
 *
 * Re-run it when the recording ages. The page judges `recordedAt` with the same
 * `freshness` the board uses, so a stale one is visible rather than silent, and
 * the fix is this command.
 */
import { record } from './showcase-record';
import { writeShowcase, type Showcase } from './showcase';

/**
 * The default thesis, and why this one.
 *
 * It is about the chain's own economy rather than a generic index play, both
 * legs resolve to tokens that actually exist on X Layer, and it is nothing like
 * `thesis-fixture.ts` — so a reader who checks cannot mistake the recording for
 * the canned example.
 */
const DEFAULT_THESIS =
  'Stablecoin settlement volume keeps compounding onchain, so the issuers and the exchanges ' +
  'that clear it capture more of the payments margin than the incumbent card networks do.';

const usd = (n: number) =>
  `$${n.toLocaleString('en-US', { maximumFractionDigits: n < 100 ? 2 : 0 })}`;

const thesis = process.argv[2] ?? DEFAULT_THESIS;
const notional = Number(process.argv[3] ?? 250_000);

console.log(`recording a live run — ${usd(notional)}\n  "${thesis}"\n`);

const showcase: Showcase = await record(thesis, notional);
const path = writeShowcase(showcase);
const t = showcase.totals;

console.log(`  compiled by  ${showcase.provider}`);
console.log(`  claim        ${showcase.claim}`);
console.log(`  legs         ${showcase.lines.map((l) => l.symbol).join(', ') || 'none'}`);
if (showcase.invented > 0) console.log(`  invented     ${showcase.invented} with no token on chain`);
console.log();

for (const line of showcase.lines) {
  console.log(
    `  ${line.symbol.padEnd(9)} asked ${String(line.targetBps / 100).padStart(6)}%  ` +
      `placed ${String(line.plannedBps / 100).padStart(5)}%  ${usd(line.notional).padStart(11)}  ` +
      `naive ${String(line.naiveImpactBps).padStart(5)}bp -> ${line.plannedImpactBps}bp`,
  );
}

console.log(`\n  asked        ${usd(t.askedUsdg)}`);
console.log(`  placed       ${usd(t.placedUsdg)}`);
// The number the page must never bury. It is the market's answer, not ours.
console.log(`  refused      ${usd(t.unallocatedUsdg)}  (the market cannot take it)`);
console.log(`  naive cost   ${usd(t.naiveCostUsdg)}`);
console.log(`  planned cost ${usd(t.plannedCostUsdg)}`);

const executable = showcase.verdicts.filter((v) => v.ok).length;
console.log(`\n  guard        ${executable}/${showcase.verdicts.length} would execute`);
for (const v of showcase.verdicts.filter((x) => !x.ok)) {
  console.log(`               ${v.symbol} refused — ${v.reason ?? 'no reason given'}`);
}

console.log(`\n  written to   ${path}`);
