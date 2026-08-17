/**
 * Run the pipeline for real and distil what the console renders.
 *
 * Separate from `showcase.ts` so reading a recording costs a file read, not the
 * whole pipeline. See the note there.
 */
import { runPipeline } from './pipeline';
import type { Showcase } from './showcase';

/** Runs the pipeline for real and distils what the page renders. */
export async function record(
  thesis: string,
  notionalUsdg: number,
  maxImpactBps = 50,
): Promise<Showcase> {
  let compile: any = null;
  let allocate: any = null;
  let plan: any = null;
  let oracle: any = null;

  for await (const event of runPipeline(thesis, notionalUsdg, maxImpactBps)) {
    if ('error' in event) throw new Error(event.error);
    if (!('stage' in event) || event.status !== 'done') continue;
    if (event.stage === 'compile') compile = event.data;
    if (event.stage === 'allocate') allocate = event.data;
    if (event.stage === 'plan') plan = event.data;
    if (event.stage === 'oracle') oracle = event.data;
  }

  if (!compile || !plan || !oracle) throw new Error('run did not reach a verdict');

  // The guard against recording a fixture as a run. Checked here rather than
  // only on read, so a bad recording never reaches the file in the first place.
  if (!compile.live) {
    throw new Error(
      `provider ${compile.provider} is not live — set GEMINI_API_KEY. A fixture is not a run.`,
    );
  }

  const placedUsdg = plan.lines.reduce((sum: number, l: any) => sum + l.notional, 0);

  return {
    recordedAt: Math.floor(Date.now() / 1000),
    thesis,
    claim: compile.thesis.claim,
    horizonDays: compile.thesis.horizonDays,
    provider: compile.provider,
    live: compile.live,
    notionalUsdg,
    maxImpactBps,
    lines: plan.lines.map((l: any) => ({
      symbol: l.symbol,
      targetBps: l.targetBps,
      plannedBps: l.plannedBps,
      notional: l.notional,
      naiveImpactBps: l.naiveImpactBps,
      plannedImpactBps: l.plannedImpactBps,
      slices: l.slices,
    })),
    verdicts: oracle.verdicts.map((v: any) => ({
      symbol: v.symbol,
      fillSizeUsdg: v.fillSizeUsdg,
      impactBps: v.impactBps,
      ok: v.decision.ok,
      reason: v.decision.reason,
    })),
    invented: allocate?.invented?.length ?? 0,
    totals: {
      askedUsdg: plan.totalUsdg,
      placedUsdg,
      unallocatedUsdg: plan.unallocated,
      naiveCostUsdg: plan.naiveCost,
      plannedCostUsdg: plan.plannedCost,
    },
  };
}
