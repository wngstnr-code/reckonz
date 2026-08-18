/**
 * Whether this system can currently do the thing it exists to do.
 *
 * Written because on 2026-08-14 the deployed oracle had been stale for
 * **173,242 seconds** — a shade under two days — every fill was being refused,
 * and the only way anyone found out was by calling `/api/fill` by hand. There
 * was no healthcheck, no alert, and nothing that would ever have said so. A
 * publisher that stops is the most likely outage this project has, and it was
 * also the one nothing watched.
 *
 * ## What "healthy" means here, and it is not "the server responded"
 *
 * A Next.js route that returns `{ ok: true }` proves the deployment is up,
 * which is the least interesting question. The interesting one is whether a
 * **fill would succeed right now**, and that turns on things the deployment has
 * no control over: the RPC answering, and the oracle being fresh enough for
 * `checkExecution` to pass. So this reports on those, per asset the live mandate
 * can actually trade.
 *
 * ## The classification is pure, and the reads are not
 *
 * Everything below takes its facts as arguments. The route does the RPC work and
 * hands the numbers here, which is what makes the rule — *when is this down?* —
 * a thing with tests rather than a thing woven through a handler.
 */

export type HealthStatus = 'ok' | 'degraded' | 'down';

/**
 * Gas for one publish of the whole universe, in units.
 *
 * **Measured, not estimated**: 919,563 for thirty assets against 142,872 for
 * four (D85). Rounded up to 900,000 for the thirty slots plus 60,000 for the
 * transaction itself, which is the shape `publish.ts` has always used and now
 * imports from here rather than keeping its own copy — the copy is what drifts
 * (D60, and the one-source rule in `CLAUDE.md`).
 *
 * The saving from publishing fewer is under-linear because the first write in a
 * transaction pays for the transaction, not because a slot is free.
 */
const GAS_PER_THIRTY_SLOTS = 900_000n;
const GAS_PER_TRANSACTION = 60_000n;

/** The worker's cadence, and what a runway in *days* is measured against. */
export const PUBLISH_INTERVAL_SEC = 600;

/**
 * Days of publishing left, at the current gas price and cadence.
 *
 * The point of computing this at all: gas exhaustion is the one outage in this
 * project with a **known date**. D85 put it at ~6 Sep and left a calendar
 * reminder for 3 Sep, which is a plan that depends on a person remembering.
 * `publish.ts` does warn, but at 20 runs left — 3.3 hours at thirty assets — and
 * a warning measured in hours is not a warning for a runway measured in weeks.
 * A monitor that already runs every five minutes can see it coming for a week.
 *
 * The gas price is read now and assumed to hold. It has been flat at 0.02 gwei
 * across every sample taken here, and a runway is a projection either way: what
 * makes it useful is that it moves *early*, not that it is exact.
 */
export function publishRunway(
  gas: PublisherGas,
  slots = 30,
  intervalSec = PUBLISH_INTERVAL_SEC,
): Runway {
  const perRunWei =
    ((GAS_PER_THIRTY_SLOTS * BigInt(slots)) / 30n + GAS_PER_TRANSACTION) * gas.gasPriceWei;
  // A zero gas price is not a free publisher, it is an unreadable one. Reporting
  // an infinite runway from it would be the reassuring direction to be wrong in.
  const runsLeft = perRunWei > 0n ? Number(gas.balanceWei / perRunWei) : 0;
  return {
    address: gas.address,
    balanceWei: gas.balanceWei.toString(),
    gasPriceWei: gas.gasPriceWei.toString(),
    runsLeft,
    days: (runsLeft * intervalSec) / 86_400,
    measurable: perRunWei > 0n,
  };
}

export interface Runway {
  address: string;
  /** Strings, because this is serialised to JSON and a bigint is not. */
  balanceWei: string;
  gasPriceWei: string;
  runsLeft: number;
  days: number;
  /** False when the gas price read as zero, which is a failed read, not free gas. */
  measurable: boolean;
}

/**
 * How little runway is worth an alert.
 *
 * A week, and the number is a lead time rather than a risk threshold: topping up
 * means buying OKB somewhere and moving it, which is a thing a person does on a
 * weekday, and seven days spans a weekend with room to spare. Tighter and the
 * alert arrives when the answer is already "shut it down"; looser and it fires
 * for a fortnight and gets filtered, which is how a monitor dies.
 */
export const RUNWAY_WARN_DAYS = 7;

export interface AssetHealth {
  symbol: string;
  /** Seconds since the oracle last published this asset; null when never. */
  ageSeconds: number | null;
  /** The oracle's own freshness limit. Past it, `checkExecution` returns STALE. */
  maxAgeSeconds: number;
  /** False when the oracle is withholding a value for this asset. */
  hasValue: boolean;
  stale: boolean;
}

export interface HealthInput {
  /** Null when the RPC could not be reached at all. */
  blockNumber: bigint | null;
  rpcLatencyMs: number | null;
  /** The mandate whose allowlist was checked, and what it can hold. */
  mandateId: number;
  assets: AssetHealth[];
  /** Whether an evidence archive is configured for this runtime (D80). */
  archiveConfigured: boolean;
  /** Whether the thesis compiler has a key. Config, not a live call. */
  compilerConfigured: boolean;
  /** Null when the publisher's balance could not be read at all. */
  publisher: PublisherGas | null;
}

export interface PublisherGas {
  address: string;
  balanceWei: bigint;
  gasPriceWei: bigint;
}

export interface HealthReport {
  status: HealthStatus;
  /** Short sentences, worst first. Empty when everything is fine. */
  problems: string[];
  checkedAt: number;
  chain: { blockNumber: string | null; latencyMs: number | null };
  mandateId: number;
  assets: AssetHealth[];
  archiveConfigured: boolean;
  compilerConfigured: boolean;
  /** Null when the balance could not be read; see `publishRunway`. */
  runway: Runway | null;
}

/**
 * The rule, in one place.
 *
 *   **down**     — nothing can execute: the RPC is unreachable, or every asset
 *                  the mandate allows has a stale or withheld oracle value.
 *   **degraded** — something is wrong but a fill can still happen: some assets
 *                  stale, or the evidence archive is not configured, or the
 *                  compiler has no key.
 *   **ok**       — none of the above.
 *
 * `down` is deliberately not reserved for "the process is dead". A deployment
 * that answers every request in 200ms while refusing every trade is down for
 * the only purpose it has, and a monitor that calls that healthy is a monitor
 * that will let it sit like that for two days.
 */
export function classifyHealth(input: HealthInput, now = Math.floor(Date.now() / 1000)): HealthReport {
  const problems: string[] = [];
  let status: HealthStatus = 'ok';

  if (input.blockNumber === null) {
    problems.push('the X Layer RPC did not answer — nothing can be quoted or executed');
    status = 'down';
  }

  const usable = input.assets.filter((a) => !a.stale && a.hasValue);
  const stale = input.assets.filter((a) => a.stale || !a.hasValue);

  if (input.assets.length === 0) {
    // Caught by its own test, which failed on the first run: the guard was
    // `assets.length > 0 && usable.length === 0`, so an **empty** allowlist —
    // the mandate read failing, or a mandate holding nothing — fell through to
    // `ok`. Nothing is executable in that state, and reporting it as healthy
    // would be reporting on the web server rather than on the product, which is
    // the exact failure this file exists to end.
    problems.push(
      `mandate #${input.mandateId} has no allowed assets to check — either it holds none or the ` +
        'read failed. Nothing is executable either way.',
    );
    status = 'down';
  } else if (usable.length === 0) {
    const worst = oldest(input.assets);
    problems.push(
      `every asset mandate #${input.mandateId} allows has an unusable oracle value — ` +
        `the guard will refuse every fill${worst === null ? '' : ` (oldest ${worst}s)`}. ` +
        'The publisher has almost certainly stopped.',
    );
    status = 'down';
  } else if (stale.length > 0) {
    problems.push(
      `${stale.length} of ${input.assets.length} allowed assets have a stale or withheld value: ` +
        stale.map((a) => a.symbol).join(', '),
    );
    if (status !== 'down') status = 'degraded';
  }

  if (!input.archiveConfigured) {
    // Not user-facing: fills still work. But every bundle written while this is
    // false is a receipt nobody can ever audit, which is a slow, silent loss
    // rather than an outage — exactly the kind that needs saying out loud (D80).
    problems.push('no evidence archive is configured — bundles from this runtime cannot be audited');
    if (status === 'ok') status = 'degraded';
  }

  const runway = input.publisher === null ? null : publishRunway(input.publisher);

  if (runway === null) {
    // The RPC being down already says this louder, so it is only worth a
    // sentence when the chain answered and this one read did not.
    if (input.blockNumber !== null) {
      problems.push("the publisher's gas balance could not be read — its runway is unknown");
      if (status === 'ok') status = 'degraded';
    }
  } else if (!runway.measurable) {
    problems.push('the gas price read as zero, so the publisher runway cannot be computed');
    if (status === 'ok') status = 'degraded';
  } else if (runway.days < RUNWAY_WARN_DAYS) {
    // Deliberately never `down`. The publisher is still publishing and every
    // fill still works; what is true is that a date is approaching on which
    // none of that will be true, and the two states are not the same fact. When
    // the gas does run out, the staleness rule above calls it down on its own.
    problems.push(
      `the publisher has ${runway.days.toFixed(1)} days of gas left ` +
        `(${runway.runsLeft} publishes at the current price). Top up ${runway.address} or shut ` +
        'the worker down deliberately — a publisher that runs dry takes every fill with it.',
    );
    if (status === 'ok') status = 'degraded';
  }

  if (!input.compilerConfigured) {
    problems.push('the thesis compiler has no key — /api/run will fail at the first stage');
    if (status === 'ok') status = 'degraded';
  }

  return {
    status,
    problems,
    checkedAt: now,
    chain: {
      blockNumber: input.blockNumber === null ? null : input.blockNumber.toString(),
      latencyMs: input.rpcLatencyMs,
    },
    mandateId: input.mandateId,
    assets: input.assets,
    archiveConfigured: input.archiveConfigured,
    compilerConfigured: input.compilerConfigured,
    runway,
  };
}

function oldest(assets: AssetHealth[]): number | null {
  const ages = assets.map((a) => a.ageSeconds).filter((a): a is number => a !== null);
  return ages.length ? Math.max(...ages) : null;
}

/**
 * The HTTP status a monitor will act on.
 *
 * 503 for `down`, 200 for everything else. An uptime check pages on a non-2xx,
 * so the split has to match what is worth waking up for: a stale oracle means
 * no user can trade, and that is worth waking up for. A missing archive is not.
 */
export function healthHttpStatus(status: HealthStatus): number {
  return status === 'down' ? 503 : 200;
}

/** One line per problem, for a terminal. */
export function describeHealth(report: HealthReport): string[] {
  if (report.status === 'ok') return [`ok — block ${report.chain.blockNumber}`];
  return [`${report.status.toUpperCase()}`, ...report.problems.map((p) => `  · ${p}`)];
}
