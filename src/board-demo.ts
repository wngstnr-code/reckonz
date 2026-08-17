/**
 * `pnpm board` — measure every xStock once and write the snapshot down.
 *
 * Takes a minute or two against the throttled public RPC. That is the whole
 * reason this is a script and not a request handler: `GET /api/board` reads the
 * file this leaves behind, so the page answers instantly and every number on it
 * carries the timestamp of this run.
 *
 * Re-run it and commit the result whenever the board is worth refreshing. The
 * chain still decides what is true; a stale file costs currency, never
 * correctness, and the page says how old it is.
 */
import { measureBoard, LADDER_USDG } from './board';
import { writeBoard } from './board-store';
import { DEFAULT_MANDATE } from './guard';

const usd = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });

const started = Date.now();
console.log('\n  Measuring the assets board on X Layer mainnet.');
console.log('  Pool depth, the issuer mark, the deployed oracle, then the guard.\n');

const board = await measureBoard();
const limit = DEFAULT_MANDATE.maxImpactBps;

console.log(
  `  ${'asset'.padEnd(10)} ${'fair value'.padStart(12)} ${'gap'.padStart(5)} ` +
    `${`cap @${limit}bp`.padStart(12)}  verdict at ${usd(LADDER_USDG[0]!)} USDG`,
);
console.log('  ' + '─'.repeat(72));

for (const asset of board.assets) {
  const value = asset.publishable && asset.fairValue !== null
    ? asset.fairValue.toFixed(2)
    : 'withheld';

  // Three different facts, printed as three different words. Collapsing them
  // into one `0` is how the first run of this script reported nine live markets
  // and an unreachable one in the same breath.
  const cap =
    asset.depth === 'unreadable' ? 'not read' : usd(asset.capacityUsdg[limit] ?? 0);
  const first = asset.ladder[0];
  const verdict =
    asset.depth === 'unreadable'
      ? 'could not read its pools'
      : asset.depth === 'no-pool'
        ? 'no USDG pool'
        : asset.depth === 'no-liquidity'
          ? 'pool is dry'
          : first
            ? first.decision.ok
              ? 'ALLOW'
              : `REJECT ${first.decision.reason}`
            : '—';

  console.log(
    `  ${asset.symbol.padEnd(10)} ${value.padStart(12)} ${String(asset.gapRisk).padStart(5)} ` +
      `${cap.padStart(12)}  ${verdict}`,
  );
}

console.log('  ' + '─'.repeat(72));

// The total on its own is half a truth when one token is most of it, so the
// median and the concentration are printed beside it rather than below it.
const total = board.totals.capacityUsdg[limit] ?? 0;
const mid = board.totals.medianUsdg[limit] ?? 0;
const largest = board.totals.largest;

const priced = board.assets.length - board.totals.unmeasured.length;
const tradable = priced - board.totals.dry.length;
console.log(
  `  tradable                  ${String(tradable).padStart(12)} of ${board.assets.length} assets`,
);
if (board.totals.dry.length > 0) {
  console.log(`  no depth right now        ${board.totals.dry.join(', ')}`);
}
if (board.totals.unmeasured.length > 0) {
  console.log(`  could not read            ${board.totals.unmeasured.join(', ')}`);
}
console.log(`  total absorbable at ${limit}bp   ${usd(total).padStart(12)} USDG`);
console.log(`  median asset               ${usd(mid).padStart(12)} USDG`);
if (largest) {
  const share = (largest.shareOfTotal * 100).toFixed(0);
  console.log(
    `  largest single            ${usd(largest.usdg).padStart(12)} USDG  ` +
      `${largest.symbol}, ${share}% of the total`,
  );
}

const allowedAtEachRung = board.ladderUsdg.map((size, i) => {
  const allowed = board.assets.filter((a) => a.ladder[i]?.decision.ok).length;
  return `${usd(size)}: ${allowed}/${tradable}`;
});
console.log(`\n  would execute, by size    ${allowedAtEachRung.join('   ')}`);

// The file, not the archive. A board measured on a laptop reaching production
// by being committed is the same path `observations/registry.jsonl` takes; a
// local run quietly overwriting the archive the worker keeps current would be a
// surprise nobody asked for.
const path = writeBoard(board);
console.log(`\n  written to ${path}`);
console.log('  commit it to ship this measurement; the worker keeps the archive current');
console.log(`  measured at ${new Date(board.measuredAt * 1000).toISOString()}`);
console.log(`  took ${((Date.now() - started) / 1000).toFixed(1)}s\n`);
