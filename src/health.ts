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
