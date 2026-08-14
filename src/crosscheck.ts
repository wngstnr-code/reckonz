/**
 * A second opinion before a number goes on chain.
 *
 * Since D62 every fair value has exactly one source: the issuer's own two-sided
 * quote, times the shares-per-token multiplier. That is the right source — it is
 * a dealer with money behind it, and it prices better than the regression it
 * replaced — but it is **one** source, and nothing between it and
 * `publishMany` ever asked whether the number was sane. If the issuer's API
 * changes shape, mis-scales a quote, or returns another asset's price, the
 * oracle publishes it.
 *
 * The on-chain bound (D41) is not that check. It caps the *rate* of change, not
 * the correctness of a value, twelve confirmed steps are an 8x
 * (`test_APatientAttackerStillGetsThere`), and — the hole this module was
 * written for — **it re-anchors freely once publishing has lapsed a day**, which
 * is exactly the state a manually-run publisher is in most of the time.
 *
 * So: four checks, each against something the issuer does not control.
 *
 *   1. the quote against **itself**    — bid, ask and mid must cohere
 *   2. the spread against **plausibility** — a market nobody would trade in
 *   3. the mid against **our own history** — `observations/`, the store we keep
 *   4. the value against **the chain**  — the pool is an independent price
 *
 * Every threshold below is derived from a number this repo has measured, and the
 * derivation is written beside it. None is a feel.
 *
 * ## Withhold, never correct
 *
 * A failed check marks the value unpublishable. It never adjusts, clamps, or
 * substitutes: this oracle's whole claim is that it refuses rather than invents,
 * and a cross-check that repaired a suspicious number would be inventing one
 * with extra steps. The previous observation stays where it is and goes stale on
 * its own, which the guard already handles.
 *
 * ## A check that cannot run is not a check that passed
 *
 * `observations/` holds 60 samples as of 2026-08-14 — two per asset, one
 * session, before the publish worker has ever run. So the history check will
 * usually **skip**, and it reports `skipped` with the reason rather than `ok`.
 * The difference matters: `ok` invites a reader to believe something was
 * verified. The same rule as `pnpm measure` refusing to derive a σ from fewer
 * than 30 jumps (D63).
 */

/** No I/O here on purpose: everything is an argument, so all of it is testable. */
export interface CrossCheckInput {
  symbol: string;
  /** The value about to be published, in USD per token. */
  fairValue: number | null;
  /** The issuer's quote the value was built from. */
  quote: { bid: number; ask: number; mid: number; spreadBps: number } | null;
  /**
   * The most recent stored sample for this symbol, if there is one, and how old
   * it is in seconds. From `observations/`, which is our own record rather than
   * the issuer's.
   */
  previous: { mid: number; ageSeconds: number } | null;
  /** `MEASURED[symbol].gaps.overnightSd`, the asset's own close-to-open σ. */
  overnightSd: number | null;
  /** X Layer's own price for the token, when a pool was read. */
  onchainPrice: number | null;
}

export type CheckVerdict = 'ok' | 'failed' | 'skipped';

export interface Check {
  name: 'quote-coherence' | 'spread-plausibility' | 'step-vs-history' | 'pool-divergence';
  verdict: CheckVerdict;
  /** One sentence, carrying the numbers. Goes in the report's notes. */
  detail: string;
}

export interface CrossCheckResult {
  /** False when any check failed. A skip is not a failure. */
  publishable: boolean;
  checks: Check[];
  /** Just the failures, for a caller that only wants to say why. */
  reasons: string[];
}

/**
 * The widest dealer spread this can be and still describe a market.
 *
 * Derived, not chosen: every spread in `observations/` sits between **10 and 30
 * bps**, and the widest *open-gap band* ever recorded here is
 * `WIDEST_RECORDED_BAND_BPS = 853` (wSNDKx). 2,000 bps is 66× the widest spread
 * observed and 2.3× the widest band, so nothing this repo has measured comes
 * near it. That is the point: this catches a broken feed — a bid of zero, a
 * quote in the wrong units — and must never second-guess a genuinely wide
 * market, because refusing to price a volatile asset is a cost paid by the user
 * who most needs the number.
 */
export const MAX_PLAUSIBLE_SPREAD_BPS = 2_000;

/**
 * How far the mid may move from our last recorded one before it is suspect.
 *
 * `max(8σ, 20%)`, where σ is the asset's own measured overnight jump. Eight
 * sigma rather than three: this is a bug detector, not a volatility model, and
 * the cost of a false positive is a withheld value on a real move. The 20% floor
 * exists because the quietest assets here have σ ≈ 0.9% (wAAPLx), and 8σ of that
 * is 7.4% — a number a real Monday morning can produce.
 */
export const STEP_SIGMAS = 8;
export const STEP_FLOOR = 0.2;

/**
 * Beyond this age the previous sample is not a comparison worth making. Two days
 * covers a weekend gap; past that a large move is ordinary and the check would
 * be refusing normal price discovery.
 */
export const HISTORY_MAX_AGE_SECONDS = 48 * 3_600;

/**
 * How far the chain may be from the published value before one of them is wrong
 * about which asset it is pricing.
 *
 * Bracketed by D38's admission test rather than picked: the widest **admitted**
 * basis was 2.0% (wIBMx) and the narrowest **rejected** one was 86.4% (wSKHYx,
 * a currency error). 50% sits between them with an order of magnitude of room on
 * the side that matters, so a thin pool drifting intraday is never caught by it
 * and a wrong-token or wrong-scale error always is.
 */
export const MAX_POOL_DIVERGENCE_BPS = 5_000;

export function crossCheck(input: CrossCheckInput): CrossCheckResult {
  const checks: Check[] = [];

  // ------------------------------------------------------- 1. the quote itself
  if (!input.quote) {
    checks.push({
      name: 'quote-coherence',
      verdict: 'skipped',
      detail: 'no issuer quote was supplied',
    });
  } else {
    const { bid, ask, mid } = input.quote;
    const coherent = bid > 0 && ask > 0 && ask >= bid && mid >= bid && mid <= ask;
    checks.push({
      name: 'quote-coherence',
      verdict: coherent ? 'ok' : 'failed',
      detail: coherent
        ? `bid ${bid} ≤ mid ${mid} ≤ ask ${ask}`
        : `the quote does not cohere: bid ${bid}, mid ${mid}, ask ${ask}`,
    });
  }

  // -------------------------------------------------------- 2. the spread
  if (!input.quote) {
    checks.push({
      name: 'spread-plausibility',
      verdict: 'skipped',
      detail: 'no issuer quote was supplied',
    });
  } else {
    const wide = input.quote.spreadBps > MAX_PLAUSIBLE_SPREAD_BPS;
    checks.push({
      name: 'spread-plausibility',
      verdict: wide ? 'failed' : 'ok',
      detail: wide
        ? `spread ${input.quote.spreadBps}bp is past ${MAX_PLAUSIBLE_SPREAD_BPS}bp — that is not a market, it is a broken quote`
        : `spread ${input.quote.spreadBps}bp`,
    });
  }

  // ------------------------------------------------- 3. against our own history
  const step = stepCheck(input);
  checks.push(step);

  // ----------------------------------------------------------- 4. the chain
  checks.push(poolCheck(input));

  const reasons = checks.filter((c) => c.verdict === 'failed').map((c) => c.detail);
  return { publishable: reasons.length === 0, checks, reasons };
}

function stepCheck(input: CrossCheckInput): Check {
  const name = 'step-vs-history' as const;
  const mid = input.quote?.mid ?? null;

  if (mid === null || !(mid > 0)) {
    return { name, verdict: 'skipped', detail: 'no current mid to compare' };
  }
  if (!input.previous || !(input.previous.mid > 0)) {
    return { name, verdict: 'skipped', detail: 'nothing recorded for this asset yet' };
  }
  if (input.previous.ageSeconds > HISTORY_MAX_AGE_SECONDS) {
    return {
      name,
      verdict: 'skipped',
      detail: `the last recorded mark is ${Math.round(input.previous.ageSeconds / 3_600)}h old — too old to compare against`,
    };
  }
  if (input.overnightSd === null || !(input.overnightSd > 0)) {
    return { name, verdict: 'skipped', detail: 'no measured σ for this asset' };
  }

  const move = Math.abs(mid / input.previous.mid - 1);
  const limit = Math.max(STEP_SIGMAS * input.overnightSd, STEP_FLOOR);
  const failed = move > limit;

  return {
    name,
    verdict: failed ? 'failed' : 'ok',
    detail: failed
      ? `the mid moved ${(move * 100).toFixed(1)}% from our last recorded mark, past ${(limit * 100).toFixed(1)}% (${STEP_SIGMAS}σ)`
      : `${(move * 100).toFixed(2)}% from the last recorded mark, inside ${(limit * 100).toFixed(1)}%`,
  };
}

function poolCheck(input: CrossCheckInput): Check {
  const name = 'pool-divergence' as const;

  if (input.fairValue === null || !(input.fairValue > 0)) {
    return { name, verdict: 'skipped', detail: 'no value to compare' };
  }
  if (input.onchainPrice === null || !(input.onchainPrice > 0)) {
    return { name, verdict: 'skipped', detail: 'no pool price was read for this asset' };
  }

  const basisBps = Math.abs(input.onchainPrice / input.fairValue - 1) * 10_000;
  const failed = basisBps > MAX_POOL_DIVERGENCE_BPS;

  return {
    name,
    verdict: failed ? 'failed' : 'ok',
    detail: failed
      ? `the pool is ${(basisBps / 100).toFixed(1)}% from this value — past ${MAX_POOL_DIVERGENCE_BPS / 100}%, so one of the two is pricing something else`
      : `the pool is ${(basisBps / 100).toFixed(2)}% from this value`,
  };
}

/** One line per check, for a terminal. */
export function describeCrossCheck(result: CrossCheckResult): string[] {
  return result.checks.map((c) => {
    const mark = c.verdict === 'ok' ? '✓' : c.verdict === 'failed' ? '✗' : '·';
    return `${mark} ${c.name.padEnd(20)} ${c.detail}`;
  });
}
