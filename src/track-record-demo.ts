/**
 * What every published thesis actually did — the terminal view of Simple mode.
 *
 * Same module the web app renders, so the two cannot disagree (D28).
 *
 *     pnpm track-record
 */
import { loadRegistry, usdg } from './track-record';

const snapshot = await loadRegistry();

console.log(`\n  ThesisRegistry + ReceiptRegistry, chain ${snapshot.chainId}\n`);

if (snapshot.theses.length === 0) {
  console.log('  No thesis has been published yet.\n');
}

for (const t of snapshot.theses) {
  const when = new Date(t.publishedAt * 1000).toISOString().slice(0, 16).replace('T', ' ');
  console.log(`  ── thesis #${t.id}  published ${when} by ${t.author}`);
  console.log(`     hash ${t.contentHash}`);
  console.log(`     cid  ${t.cid || '(none — the hash is what binds)'}`);

  if (t.record.fillCount === 0) {
    console.log(`     no executions carry this hash yet\n`);
    continue;
  }

  console.log(
    `\n     basket, derived from settled fills` +
      ` — ${usdg(t.record.notionalUsdg)} USDG across ${t.record.entryCount} entr` +
      `${t.record.entryCount === 1 ? 'y' : 'ies'}`,
  );
  for (const b of t.basket) {
    const pct = (b.weightBps / 100).toFixed(2).padStart(6);
    console.log(`       ${pct}%  ${b.symbol.padEnd(8)} ${usdg(b.notionalUsdg).padStart(10)} USDG`);
  }

  console.log(
    `\n     slippage   ${t.record.weightedSlippageBps} bps weighted, ` +
      `${t.record.worstSlippageBps} bps worst`,
  );
  console.log(
    `     ordering   ${
      t.publishedBeforeExecution
        ? 'every fill settled after the thesis was published'
        : '⚠ a fill predates the thesis — the foresight claim does not hold'
    }`,
  );

  console.log(`     receipts   ${t.receipts.map((r) => `#${r.id}`).join(', ')}\n`);
}

// Reported, not hidden: these are real fills that were never declared in
// advance, and a track record page that drops them overstates the discipline.
if (snapshot.unattributed.length > 0) {
  const fills = snapshot.unattributed.reduce((n, r) => n + r.fills.length, 0);
  console.log(
    `  ${snapshot.unattributed.length} receipt${snapshot.unattributed.length === 1 ? '' : 's'}` +
      ` (${fills} fill${fills === 1 ? '' : 's'}) carry no thesis hash:` +
      ` ${snapshot.unattributed.map((r) => `#${r.id}`).join(', ')}`,
  );
  console.log(`  Executed without a published thesis. Not attributable to one.\n`);
}

if (snapshot.orphanedHashes.length > 0) {
  console.log(`  ⚠ fills reference ${snapshot.orphanedHashes.length} hash(es) never published:`);
  for (const h of snapshot.orphanedHashes) console.log(`    ${h}`);
  console.log();
}
