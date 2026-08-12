/**
 * The registry index, from the terminal.
 *
 *   pnpm index             # fetch what is new, append it
 *   pnpm index --verify    # re-read every stored record from the chain
 *   pnpm index --rebuild   # move the store aside and index from zero
 *
 * `--rebuild` renames rather than deletes. A store that took an afternoon of
 * throttled reads to fill is not something a flag should be able to destroy.
 */
import { STORE, indexRegistries, readIndex, verifyIndex } from './indexer';

const mode = process.argv[2];

if (mode === '--verify') {
  const stored = await readIndex();
  console.log(
    `\n  verifying ${stored.theses.length} theses and ${stored.receipts.length} receipts` +
      ` in ${STORE}\n  against the chain, field by field — this is a full re-read\n`,
  );

  const mismatches = await verifyIndex();
  if (mismatches.length === 0) {
    console.log('  ✅ every stored record matches the chain\n');
  } else {
    console.log(`  ⚠ ${mismatches.length} field(s) disagree:\n`);
    for (const m of mismatches) {
      console.log(`    ${m.kind} #${m.id}  ${m.field}`);
      console.log(`      stored ${m.stored}`);
      console.log(`      chain  ${m.chain}`);
    }
    console.log(
      `\n  The chain is right and the store is not. Re-index with --rebuild, and\n` +
        `  work out what wrote this before trusting the next one.\n`,
    );
    process.exit(1);
  }
} else {
  if (mode === '--rebuild') {
    const { rename } = await import('node:fs/promises');
    const aside = `${STORE}.${Date.now()}.bak`;
    try {
      await rename(STORE, aside);
      console.log(`\n  moved the old store to ${aside}`);
    } catch {
      /* nothing to move */
    }
  }

  const run = await indexRegistries();

  console.log(`\n  ReceiptRegistry + ThesisRegistry, chain ${run.chainId}  →  ${STORE}\n`);
  console.log(`  on chain    ${run.onChain.theses} theses, ${run.onChain.receipts} receipts`);
  console.log(`  had         ${run.had.theses} theses, ${run.had.receipts} receipts`);

  const theses = run.added.filter((r) => r.kind === 'thesis');
  const receipts = run.added.filter((r) => r.kind === 'receipt');
  console.log(`  appended    ${theses.length} theses, ${receipts.length} receipts`);

  for (const record of run.added) {
    if (record.kind === 'thesis') {
      console.log(`    thesis  #${record.id}  ${record.contentHash}`);
    } else {
      const legs = record.fills.map((f) => `${f.isExit ? '-' : '+'}${f.symbol}`).join(' ');
      const bound = record.thesisHash.replace(/0x0+$/, '') === '' ? 'no thesis' : 'thesis-bound';
      console.log(`    receipt #${record.id}  block ${record.blockNumber}  ${legs}  (${bound})`);
    }
  }

  if (run.withheld > 0) {
    console.log(
      `\n  ${run.withheld} record(s) held back — within 12 blocks of head ${run.head}.` +
        `\n  They will index on the next run. A reorg at the tip would renumber them.`,
    );
  }

  console.log(
    `\n  The chain still decides how many exist: this store only answers for ids\n` +
      `  below count(). Delete it and reads get slower, never wrong.\n`,
  );
}
