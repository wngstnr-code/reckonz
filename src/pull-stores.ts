/**
 * `pnpm pull:stores` — bring the workers' stores home and fold them in.
 *
 * Two processes on Railway accumulate observations this repo's numbers are
 * derived from: the publisher samples the issuer's marks into its volume, and
 * the drift sampler writes paired walks into its own. Both write to a volume
 * rather than the repo on purpose (D67, D90) — a worker that can push is a
 * worker holding a token, and the publisher already holds a hot key. So the
 * files come back by hand.
 *
 * **By hand should not mean by SSH.** The first pull was done with `railway ssh
 * cat`, which needed a keypair generated, registered and a host key accepted —
 * four steps and a new credential, for a read. `railway volume files download`
 * does the same read against the volume directly, so this is one command:
 *
 *   pnpm pull:stores            # download both, merge both, say what changed
 *   pnpm pull:stores --dry-run  # download and report, write nothing
 *
 * Both merges dedupe on `symbol` + `observedAt` and can be run again with no
 * effect, which matters because the hand that runs this is the one most likely
 * to run it twice.
 *
 * It needs the Railway CLI, logged in, with this project linked. It cannot
 * write to the chain, spend gas or read a key — the credential it uses is
 * Railway's own session, and the files it fetches are already public data in
 * everything but latency.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mergeDrift, readDrift, DRIFT_STORE } from './impact-drift';
import { coverage, merge, readAll, STORE } from './observations';

const DRY_RUN = process.argv.includes('--dry-run');

interface Source {
  /** The Railway volume holding it. */
  volume: string;
  /** Path within the volume, resolved against its mount path — see below. */
  remote: string;
  /** Where it lands in the repo. */
  store: string;
  label: string;
}

/**
 * The volume, not the service, and `remote` is resolved against the volume's
 * **mount path** — `/impact-drift.jsonl` is fetched as `/data/impact-drift.jsonl`,
 * which is what the error message says when it is missing. Worth writing down
 * because `railway volume files list /` prints the same file with no `/data`
 * in front of it, so the listing and the download appear to disagree.
 */
const SOURCES: Source[] = [
  {
    volume: 'reckonz-volume',
    remote: '/issuer-marks.jsonl',
    store: STORE,
    label: "the issuer's marks",
  },
  {
    volume: 'drift-volume',
    remote: '/impact-drift.jsonl',
    store: DRIFT_STORE,
    label: 'the impact drift',
  },
];

function railwayAvailable(): boolean {
  try {
    execFileSync('railway', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

if (!railwayAvailable()) {
  console.error(
    '\n  The Railway CLI is not on PATH. `brew install railway`, then `railway login`\n' +
      '  and `railway link` against the reckonz project.\n',
  );
  process.exit(1);
}

const scratch = mkdtempSync(join(tmpdir(), 'reckonz-stores-'));
let wrote = 0;
let failed = 0;

for (const source of SOURCES) {
  const local = join(scratch, source.remote.replace(/^\//, ''));
  console.log(`\n  ${source.label} — ${source.volume}:${source.remote}`);

  try {
    execFileSync(
      'railway',
      ['volume', 'files', '-v', source.volume, 'download', source.remote, local, '--overwrite'],
      { stdio: ['ignore', 'ignore', 'inherit'] },
    );
  } catch {
    // One volume being unreachable must not cost the other. A worker that has
    // never started has no file to fetch, and that is a sentence rather than a
    // crash — the drift service is younger than the publisher and will be in
    // exactly that state the first time somebody runs this.
    console.error(`    ✗ could not download it — is the service up and the volume attached?`);
    failed++;
    continue;
  }

  if (!existsSync(local)) {
    console.error('    ✗ the download reported success and produced no file');
    failed++;
    continue;
  }

  const isDrift = source.store === DRIFT_STORE;
  const before = isDrift ? readDrift(source.store) : readAll(source.store);
  const incoming = isDrift ? readDrift(local) : readAll(local);
  const merged = isDrift
    ? mergeDrift(before as never, incoming as never)
    : merge(before as never, incoming as never);

  const added = merged.length - before.length;
  const duplicates = before.length + incoming.length - merged.length;
  console.log(
    `    had ${before.length}, incoming ${incoming.length}, now ${merged.length} ` +
      `(+${added} new, ${duplicates} already had)`,
  );

  if (DRY_RUN) {
    console.log('    --dry-run, so nothing was written');
    continue;
  }

  if (added === 0) {
    // Rewriting a file to the same bytes makes a commit that says nothing.
    console.log('    nothing new — left alone');
    continue;
  }

  writeFileSync(source.store, merged.map((s) => JSON.stringify(s)).join('\n') + '\n');
  wrote++;
  console.log(`    written to ${source.store}`);
}

if (!DRY_RUN && wrote > 0) {
  const marks = readAll();
  const cov = coverage(marks);
  const least = cov.length ? Math.min(...cov.map((c) => c.boundaries)) : 0;
  console.log(
    `\n  Next, in this order:\n` +
      `    pnpm measure          # ${least} boundary(s) on the least-covered asset — does σ move?\n` +
      `    pnpm drift --report   # does the measured drift still fit PLAN_HEADROOM?\n` +
      `    git add observations/ && git commit\n\n` +
      `  A σ or a headroom derived from a file nobody else has is a magic number.\n`,
  );
}

process.exit(failed === SOURCES.length ? 1 : 0);
