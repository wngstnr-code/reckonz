'use client';

import type { RunState } from '../../useRun';
import { usd } from '../../ui';
import { Figure } from '../Figure';

/**
 * The conclusion the page computed and never printed.
 *
 * Five panels stacked below a run and nothing above them said what the run
 * decided. Asked, executable, handed back: it is the product's own headline
 * sentence, it is computed here and nowhere else, and a reader had to add up a
 * capacity table to get it.
 *
 * `BasketRail` on `/trade` deliberately refuses this same trio, and the two are
 * not in conflict. There it would describe *somebody else's* trade -- the depth
 * that absorbed a thesis author's notional is not the depth that absorbs a
 * follower's (D50). Here the run is the reader's own, at the size they typed,
 * so the number is about them.
 *
 * Handed back is the figure that earns the page. Reporting capital a market
 * cannot take is the product; quietly forcing it in is what everything else
 * does.
 */
export function RunResult({ state }: { state: RunState }) {
  const plan = state.plan;
  if (!plan) return null;

  // `totalUsdg` is what was **asked for**, not what fits: `planBasket` takes it
  // as an argument and returns it unchanged. Reading it as the executable
  // figure reported the full ask as placeable and then added the unallocated
  // remainder on top, so a $25,000 run announced $46,951 asked and $25,000
  // executable when $3,049 was. That is the exact failure this product exists
  // to refuse -- capital a market cannot absorb, reported as if it could.
  const asked = plan.totalUsdg;
  const handedBack = plan.unallocated;
  const executable = Math.max(0, asked - handedBack);

  const verdicts = state.oracle?.verdicts ?? [];
  const allowed = verdicts.filter((v) => v.decision.ok).length;

  return (
    <div className="rounded-2xl bg-frame px-8 py-8 md:px-10">
      <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
        <h2 className="text-lead font-semibold text-cta-ink">What the chain will take</h2>
        <p className="font-mono text-meta tabular-nums text-cta-3">
          asked {usd(asked)} USDG
        </p>
      </div>

      <div className="mt-7 flex flex-wrap gap-x-11 gap-y-6 sm:flex-nowrap">
        <Figure label="Executable" value={usd(executable)}>
          inside your {plan.maxImpactBps}bp impact limit
        </Figure>

        <Figure label="Handed back" value={usd(handedBack)}>
          {handedBack === 0 ? 'the market took all of it' : 'no market here can absorb it'}
        </Figure>

        {verdicts.length > 0 && (
          <Figure label="Guard" value={`${allowed} of ${verdicts.length}`}>
            legs it will let through right now
          </Figure>
        )}
      </div>
    </div>
  );
}
