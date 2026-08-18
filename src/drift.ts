/**
 * `pnpm drift` — measure what `PLAN_HEADROOM` is supposed to cover.
 *
 * One pass by default; `--loop` keeps going and is meant to run beside
 * `pnpm publish:loop` on the same box, where it costs nothing the publisher
 * needs: no chain writes, no gas, no key, `eth_call` only. `--report` derives
 * the headroom from whatever has been collected and refuses to state one until
 * the store is long enough to mean it.
 *
 *   TARGET=mainnet pnpm drift                       # one paired walk over the universe
 *   TARGET=mainnet DRIFT_SYMBOLS=wSPYx,wTSLAx pnpm drift --loop
 *   pnpm drift --report                             # what the store says so far
 *   pnpm drift --merge ./impact-drift-from-worker.jsonl
 *
 * The store is `observations/impact-drift.jsonl`, append-only and committed for
 * the same reason the issuer's marks are: a fraction derived from a file nobody
 * else has is a magic number with a footnote. See `src/impact-drift.ts` for what
 * a sample is and why it is shaped as a paired walk rather than a time series.
 *
 * **Deployed as its own Railway service, and `railway.drift.json` is why there
 * are two config files in this repo.** Railway reads `railway.json` for every
 * service built from the repo, and config-as-code wins over anything set in the
 * dashboard — so a second service sharing that file would inherit
 * `pnpm publish:loop` and try to be a second publisher. The alternative was to
 * make the *publisher's* start command dispatch on an environment variable,
 * which edits the one job that must not break. A second config file touches
 * nothing that publishes. The service points at it, holds its own volume at
 * `/data`, and needs **no key of any kind** — this process cannot sign, so
 * there is nothing on that host worth stealing.
 *
 * `DRIFT_INTERVAL_SEC` is an hour there rather than the default half hour. A
 * pass is two full pool walks per asset and the public RPC is the constraint
 * this whole repo is written around (`serial`, D82's failover). The publisher
 * shares those endpoints and is the load-bearing job; buying twice the samples
 * at the cost of crowding it would be the tail wagging the dog again.
 */
import { writeFileSync } from 'node:fs';
import { serial } from './chain';
import { DEFAULT_MANDATE } from './guard';
import {
  appendDrift,
  driftCoverage,
  DRIFT_STORE,
  measureDrift,
  mergeDrift,
  readDrift,
  suggestHeadroom,
  type DriftSample,
  type Target,
} from './impact-drift';
import { PLAN_HEADROOM } from './planner';
import { universe } from './pipeline';

const arg = (flag: string): string | null => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
};

/**
 * The limit to size against.
 *
 * `DEFAULT_MANDATE.maxImpactBps` rather than a literal 50: a drift measured
 * against one limit says nothing about a different one, and the limit the guard
 * actually enforces is the only one worth spending an hour of RPC on. It is
 * recorded on every sample so a store collected under a changed mandate cannot
 * be silently averaged with this one.
 */
const LIMIT_BPS = Number(process.env.DRIFT_LIMIT_BPS ?? DEFAULT_MANDATE.maxImpactBps);

/**
 * How long to wait between the two walks.
 *
 * Thirty seconds is the *floor* of the window this is trying to characterise,
 * not its width. In a run, stage 3 sizes and stage 6 asks the guard a dozen RPC
 * calls later; from the browser, the fill is later still, because a person has
 * to read a panel and sign. So a headroom derived at 30s is a lower bound on the
 * one a browser fill needs, and the store keeps `gapSec` per sample precisely so
 * that a later reader can cut the distribution by window instead of trusting
 * this default.
 */
const GAP_SEC = Number(process.env.DRIFT_GAP_SEC ?? 30);

/** How long between passes in `--loop`. Long, because a pass is two full walks. */
const INTERVAL_SEC = Number(process.env.DRIFT_INTERVAL_SEC ?? 1_800);

const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const bps = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}bp`;

// ------------------------------------------------------------------ --merge

const MERGE_FROM = arg('--merge');
if (MERGE_FROM) {
  const before = readDrift();
  const incoming = readDrift(MERGE_FROM);
  if (incoming.length === 0) {
    console.error(`\n  ${MERGE_FROM} holds no drift samples — nothing to merge.\n`);
    process.exit(1);
  }
  const merged = mergeDrift(before, incoming);
  writeFileSync(DRIFT_STORE, merged.map((s) => JSON.stringify(s)).join('\n') + '\n');
  console.log(
    `\n  merged ${MERGE_FROM} into ${DRIFT_STORE}\n` +
      `    had      ${before.length}\n` +
      `    incoming ${incoming.length}\n` +
      `    now      ${merged.length}  (+${merged.length - before.length} new, ` +
      `${before.length + incoming.length - merged.length} were duplicates)\n\n` +
      `  Run it twice and the second run changes nothing. Commit the store.\n`,
  );
  process.exit(0);
}

// ----------------------------------------------------------------- --report

function report(): void {
  const all = readDrift();
  const s = suggestHeadroom(all, LIMIT_BPS);

  console.log(`\n  Impact drift — ${all.length} samples in ${DRIFT_STORE}\n`);
  if (all.length === 0) {
    console.log('  Nothing measured yet. `pnpm drift` takes one paired walk.\n');
    return;
  }

  const cov = driftCoverage(all);
  console.log(`  Worst drift by asset, at a ${LIMIT_BPS}bp limit\n`);
  for (const c of cov.slice(0, 10)) {
    console.log(`      ${c.symbol.padEnd(10)} ${bps(c.worstBps).padStart(9)}   ${c.samples} samples`);
  }
  if (cov.length > 10) console.log(`      …and ${cov.length - 10} more`);

  console.log(
    `\n  p${(s.p * 100).toFixed(0)} drift  ${bps(s.driftBps)} against a ${s.limitBps}bp limit\n` +
      `  suggested PLAN_HEADROOM  ${s.headroom.toFixed(3)}   (in force: ${PLAN_HEADROOM})\n`,
  );

  if (s.withheld) {
    // The same refusal the gap σ makes, for the same reason: a number derived
    // from a short series looks better justified than the choice it would
    // replace and is worse. Withholding is the honest state, not a failure.
    console.log(
      `  Withheld — ${s.withheld}.\n` +
        `  ${PLAN_HEADROOM} stays in force until the store is long enough to argue with.\n`,
    );
    return;
  }

  console.log(
    s.headroom < PLAN_HEADROOM
      ? '  The measurement asks for a tighter headroom than the one in force.\n'
      : '  The headroom in force covers the measured drift.\n',
  );
}

if (process.argv.includes('--report')) {
  report();
  process.exit(0);
}

// ------------------------------------------------------------------ measure

async function targets(): Promise<Target[]> {
  const all = await universe();
  const wanted = (process.env.DRIFT_SYMBOLS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (wanted.length === 0) return all.map((u) => ({ symbol: u.symbol, address: u.address }));

  return wanted.map((symbol) => {
    const hit = all.find((u) => u.symbol.toLowerCase() === symbol.toLowerCase());
    // A typo that silently measures twenty-nine assets instead of thirty is the
    // failure mode `publish.ts` refuses for the same reason: the run looks like
    // it worked. See its symbol filter.
    if (!hit) throw new Error(`DRIFT_SYMBOLS names ${symbol}, which is not in the universe`);
    return { symbol: hit.symbol, address: hit.address };
  });
}

async function pass(): Promise<DriftSample[]> {
  const list = await targets();
  // Serial, because each asset is already two throttled pool walks and the
  // public RPC is the constraint everywhere else in this repo (`serial` exists
  // for exactly this). Parallelising would measure the rate limiter.
  const out = await serial(list, async (t) => {
    try {
      return await measureDrift(t, LIMIT_BPS, GAP_SEC);
    } catch (e) {
      // One unreadable pool must not cost the whole pass. It is reported and
      // skipped, never recorded as a zero — see `measureDrift`.
      console.error(`${stamp()}  ${t.symbol} skipped — ${(e as Error).message}`);
      return null;
    }
  });
  return out.filter((s): s is DriftSample => s !== null);
}

const LOOP = process.argv.includes('--loop');

if (!Number.isFinite(GAP_SEC) || GAP_SEC < 1) {
  throw new Error(`DRIFT_GAP_SEC=${process.env.DRIFT_GAP_SEC} — a gap under a second measures nothing`);
}

let stopping = false;
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    stopping = true;
    console.log(`\n${stamp()}  stopping after this pass`);
  });
}

do {
  const started = Date.now();
  const samples = await pass();
  appendDrift(samples);

  const worst = samples.reduce<DriftSample | null>(
    (a, b) => (a === null || b.deltaBps > a.deltaBps ? b : a),
    null,
  );
  console.log(
    `${stamp()}  ${samples.length} measured at ${LIMIT_BPS}bp, ~${GAP_SEC}s apart` +
      (worst ? ` — worst ${worst.symbol} ${bps(worst.deltaBps)}` : ''),
  );

  if (!LOOP || stopping) break;
  const wait = Math.max(5_000, INTERVAL_SEC * 1000 - (Date.now() - started));
  await new Promise((r) => setTimeout(r, wait));
} while (!stopping);

if (!LOOP) report();
