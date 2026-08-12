/**
 * `pnpm sample` — write the issuer's marks down, so the band stops needing Yahoo.
 *
 * One pass by default; `--loop` keeps going and is meant to run beside
 * `pnpm publish:loop` on the same box. It is cheap in every dimension that
 * matters: no chain writes, no gas, no key, one HTTP round trip per cycle for
 * the whole universe.
 *
 *   TARGET=mainnet pnpm sample
 *   TARGET=mainnet SAMPLE_INTERVAL_SEC=300 pnpm sample --loop
 *
 * The store is append-only newline-delimited JSON at `observations/`. It is
 * committed deliberately: a σ derived from a file nobody else has is not
 * reproducible, and this repo's whole argument is that its numbers can be
 * checked. See `src/observations.ts` for why the file rather than a database.
 */
import { writeFileSync } from 'node:fs';
import { append, coverage, merge, readAll, sampleOnce, STORE } from './observations';

/**
 * `--merge <path>` folds a store collected elsewhere into the committed one.
 *
 * The case it exists for: the publish worker samples into a Railway volume,
 * because a container's own filesystem is wiped on redeploy. Nothing pushes
 * that back — deliberately, since a worker that can write to the repo is a
 * worker holding a token, and it already holds the publisher's hot key. So the
 * file is pulled down by hand and folded in with this, which is idempotent and
 * says exactly what it changed.
 */
const MERGE_FROM = process.argv.includes('--merge') ? process.argv[process.argv.indexOf('--merge') + 1] : null;

if (MERGE_FROM) {
  const before = readAll();
  const incoming = readAll(MERGE_FROM);
  if (incoming.length === 0) {
    console.error(`\n  ${MERGE_FROM} holds no marks — nothing to merge.\n`);
    process.exit(1);
  }

  const merged = merge(before, incoming);
  writeFileSync(STORE, merged.map((s) => JSON.stringify(s)).join('\n') + '\n');

  const cov = coverage(merged);
  console.log(
    `\n  merged ${MERGE_FROM} into ${STORE}\n` +
      `    had      ${before.length} marks\n` +
      `    incoming ${incoming.length}\n` +
      `    now      ${merged.length}  (+${merged.length - before.length} new, ` +
      `${before.length + incoming.length - merged.length} were duplicates)\n` +
      `    coverage ${cov.length} assets, ` +
      `${cov.length ? Math.min(...cov.map((c) => c.boundaries)) : 0} boundary(s) on the least-covered\n\n` +
      `  Run it twice and the second run changes nothing. Commit the store.\n`,
  );
  process.exit(0);
}

const LOOP = process.argv.includes('--loop');
const INTERVAL_SEC = Number(process.env.SAMPLE_INTERVAL_SEC ?? 300);

if (!Number.isFinite(INTERVAL_SEC) || INTERVAL_SEC < 60) {
  throw new Error(`SAMPLE_INTERVAL_SEC=${process.env.SAMPLE_INTERVAL_SEC} — under a minute samples noise, not prices`);
}

const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

async function once(): Promise<void> {
  const samples = await sampleOnce();
  append(samples);
  const periods = new Map<string, number>();
  for (const s of samples) periods.set(s.period, (periods.get(s.period) ?? 0) + 1);
  console.log(
    `  ${stamp()}  ${samples.length} marks  ` +
      [...periods].map(([p, n]) => `${p}:${n}`).join(' '),
  );
}

await once();

if (!LOOP) {
  const cov = coverage(readAll());
  const total = cov.reduce((s, c) => s + c.samples, 0);
  const boundaries = cov.length ? Math.min(...cov.map((c) => c.boundaries)) : 0;
  console.log(
    `\n  store ${STORE}\n` +
      `  ${total} marks across ${cov.length} assets, ` +
      `${boundaries} session boundary(s) watched on the least-covered asset\n\n` +
      '  A close-to-open jump needs a boundary. Until there are enough of them,\n' +
      '  `pnpm measure` will say so rather than derive a σ from a short series.\n',
  );
  process.exit(0);
}

console.log(`  sampling every ${INTERVAL_SEC}s — ctrl-c to stop\n`);
for (;;) {
  await new Promise((r) => setTimeout(r, INTERVAL_SEC * 1000));
  try {
    await once();
  } catch (e) {
    // A sampler that dies on one bad response loses the history it exists to
    // build. Log and carry on; a gap in the series is visible, a stopped
    // process is not.
    console.error(`  ${stamp()}  sample failed: ${(e as Error).message}`);
  }
}
