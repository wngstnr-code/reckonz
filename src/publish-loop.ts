/**
 * The publisher as a long-running process.
 *
 * `.github/workflows/publish-oracle.yml` does the same job on a schedule, and
 * for this job a schedule is the wrong tool. GitHub documents `schedule` as
 * best-effort — delayed under load, worst at the top of the hour, occasionally
 * skipped. `maxAge` is fifteen minutes, so a five-minute delay is enough to make
 * the oracle stale, and a stale oracle fails *every* on-chain check with
 * `STALE`. A timer we own does not drift.
 *
 * So this is the primary and the workflow is the backstop: if this process dies,
 * the schedule still publishes eventually, which is worse than on time and much
 * better than not at all.
 *
 * Each cycle is a **child process** rather than an in-process call. `publish.ts`
 * is a top-level script that exits on a dead gas balance, and reusing it as a
 * module would mean either rewriting it or having it call `process.exit` on the
 * loop. Spawning keeps one source of truth for what publishing *is*, and makes a
 * cycle that dies unable to take the supervisor with it.
 *
*
 * It also **samples** each cycle, into `observations/`. That store is what the
 * band's gap σ is derived from now that Yahoo is gone (D63), and it only fills
 * up while something is running. Doing it here rather than as a second process
 * is deliberate: `&` in a start command means a sampler that dies unnoticed and
 * is orphaned when the publisher exits. One process, one lifecycle, one restart
 * policy. Sampling is one HTTP call and costs no gas, so it is free to carry.
 *
 *   TARGET=mainnet PUBLISH_INTERVAL_SEC=600 pnpm publish:loop
 */
import { spawn } from 'node:child_process';
import { append, sampleOnce } from './observations';

const INTERVAL_SEC = Number(process.env.PUBLISH_INTERVAL_SEC ?? 600);
/** Consecutive failures before the process gives up and lets the host restart it. */
const MAX_CONSECUTIVE_FAILURES = Number(process.env.PUBLISH_MAX_FAILURES ?? 6);

if (!Number.isFinite(INTERVAL_SEC) || INTERVAL_SEC < 60) {
  throw new Error(`PUBLISH_INTERVAL_SEC=${process.env.PUBLISH_INTERVAL_SEC} — under a minute is a mistake, not a cadence`);
}

const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

function runOnce(): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn('npx', ['tsx', 'src/publish.ts'], {
      stdio: ['ignore', 'inherit', 'inherit'],
      env: process.env,
    });
    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
}

let consecutiveFailures = 0;
let stopping = false;

// Railway and every other host send SIGTERM before replacing the container. A
// cycle interrupted mid-publish is fine — publishing is idempotent, the next one
// overwrites — but exiting between cycles is tidier and costs nothing.
for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => {
    console.log(`${stamp()}  ${sig} — stopping after this cycle`);
    stopping = true;
  });
}

console.log(
  `${stamp()}  publish loop starting — every ${INTERVAL_SEC}s, target ${process.env.TARGET ?? 'testnet'}`,
);

while (!stopping) {
  const started = Date.now();

  // Sample before publishing, and never let it stop a publish. The store is
  // valuable and the oracle is load-bearing; a bad HTTP response must cost a
  // line in the history, not a stale oracle.
  try {
    const samples = await sampleOnce();
    append(samples);
    console.log(`${stamp()}  sampled ${samples.length} issuer marks`);
  } catch (e) {
    console.error(`${stamp()}  sample failed, publishing anyway: ${(e as Error).message}`);
  }

  const code = await runOnce();

  if (code === 0) {
    consecutiveFailures = 0;
  } else {
    consecutiveFailures++;
    console.error(
      `${stamp()}  publish exited ${code} (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES} consecutive)`,
    );
    // Out of gas, a bad key, or an RPC that has been down for an hour all look
    // the same from here. Exiting non-zero hands the decision to the host's
    // restart policy and makes the failure visible, rather than looping
    // silently on a broken configuration for days.
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      console.error(`${stamp()}  giving up — ${MAX_CONSECUTIVE_FAILURES} cycles failed in a row`);
      process.exit(1);
    }
  }

  if (stopping) break;

  // Measure the wait from when the cycle *started*, so a slow publish does not
  // push the whole schedule later and later.
  const elapsed = Date.now() - started;
  const wait = Math.max(5_000, INTERVAL_SEC * 1000 - elapsed);
  await new Promise((r) => setTimeout(r, wait));
}

console.log(`${stamp()}  stopped`);
