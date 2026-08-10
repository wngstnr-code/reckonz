/**
 * Closes the loop: the same decision the on-chain PolicyGuard will make, run
 * off-chain first so the planner never proposes a trade the chain would revert.
 *
 * Mirrors FairValueOracle.checkExecution — deliberately, line for line. If the
 * two ever disagree the off-chain planner is wrong, not the contract.
 */
import type { FairValueReport } from './fairvalue';

export interface Mandate {
  /** ceiling on the oracle's gap-risk score */
  maxGapRisk: number;
  /** how far from fair value the mandate tolerates executing, in bps */
  maxDeviationBps: number;
  /** ceiling on price impact for a single fill, in bps */
  maxImpactBps: number;
}

/**
 * One check in `FairValueOracle.checkExecution` has no counterpart here, on
 * purpose: `STALE`, which compares the on-chain `updatedAt` against `maxAge`.
 * This mirror runs against a report computed seconds ago, so there is no
 * publication to be stale. Staleness of the *reference market* is a different
 * quantity and is already priced into `gapRisk`. A `maxOracleAge` field used to
 * sit in this interface and was never read — a parameter that implies a check
 * nobody performs is worse than an acknowledged gap.
 */

export const DEFAULT_MANDATE: Mandate = {
  maxGapRisk: 60,
  maxDeviationBps: 100,
  maxImpactBps: 50,
};

export type Rejection =
  | 'NO_DATA'
  | 'STALE'
  | 'NO_REFERENCE'
  | 'GAP_RISK'
  | 'OFF_FAIR_VALUE'
  | 'PRICE_IMPACT';

export interface Decision {
  ok: boolean;
  reason?: Rejection;
  detail?: string;
}

export function checkExecution(
  report: FairValueReport,
  executionPrice: number,
  impactBps: number,
  mandate: Mandate = DEFAULT_MANDATE,
  now = Math.floor(Date.now() / 1000),
): Decision {
  // Order matters: "we withheld a value" is a different and more useful
  // answer than "we have no observation", and a withheld value must never fall
  // through to a deviation check against a number we do not trust.
  if (report.fairValue == null || report.fairValue === 0 || !report.publishable) {
    return {
      ok: false,
      reason: 'NO_REFERENCE',
      detail:
        report.notes.find((n) => n.includes('withheld')) ??
        'oracle withheld a value for this asset',
    };
  }
  if (report.anchorAt == null) {
    return { ok: false, reason: 'NO_DATA', detail: 'no observation' };
  }
  if (report.gapRisk > mandate.maxGapRisk) {
    return {
      ok: false,
      reason: 'GAP_RISK',
      detail: `gap risk ${report.gapRisk} > ${mandate.maxGapRisk}`,
    };
  }

  const deviationBps = Math.abs(executionPrice / report.fairValue - 1) * 10_000;
  const tolerance = mandate.maxDeviationBps + (report.confidenceBps ?? 0);
  if (deviationBps > tolerance) {
    return {
      ok: false,
      reason: 'OFF_FAIR_VALUE',
      detail: `${deviationBps.toFixed(0)}bp from fair value > ${tolerance.toFixed(0)}bp tolerance`,
    };
  }

  if (impactBps > mandate.maxImpactBps) {
    return {
      ok: false,
      reason: 'PRICE_IMPACT',
      detail: `${impactBps}bp impact > ${mandate.maxImpactBps}bp`,
    };
  }

  void now;
  return { ok: true };
}
