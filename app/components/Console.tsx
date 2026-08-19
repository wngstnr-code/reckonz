'use client';

import { useState } from 'react';
import { AllocationPanel, MandatePanel, OraclePanel, PlanPanel, ThesisPanel } from './panels';
import { Section } from './console/trade/Section';
import { Composer, EXAMPLES } from './console/idea/Composer';
import { PublishThesis } from './console/idea/PublishThesis';
import { RunError, RunTimeline } from './console/idea/RunTimeline';
import { RunResult } from './console/idea/RunResult';
import { STAGES, useRun } from './useRun';

/**
 * The run, from a sentence to a verdict.
 *
 * Everything used to sit in bordered `Card`s at eleven hardcoded type sizes,
 * with the six stages as grey pills and no conclusion at the end. It is the same
 * pipeline; what changed is that the page now says what happened.
 *
 * `Section` throughout, like the other three console pages. The stages are rows
 * because a two-minute wait needs more than a dot. And the result leads with
 * asked, executable and handed back -- the sentence the whole run exists to
 * produce, which the page computed and never printed.
 */

/**
 * $25,000, not $250,000.
 *
 * The old default asked for roughly six times what the single deepest market can
 * absorb, so a first run refused nearly everything and a visitor's only
 * impression was a page saying no. Refusals are the product and they still
 * appear at this size -- most of these pools stop well under it -- but alongside
 * legs that go through, which is what shows the thing working rather than only
 * declining.
 */
const DEFAULT_NOTIONAL = 25_000;

export function Console() {
  const [thesis, setThesis] = useState(EXAMPLES[0]!.text);
  const [notional, setNotional] = useState(DEFAULT_NOTIONAL);
  const [maxImpact, setMaxImpact] = useState(50);
  const { state, start, stop } = useRun();

  const run = () => start(thesis.trim(), notional, maxImpact);

  /**
   * The compiled legs, resolved to addresses.
   *
   * `Allocation` names symbols and the universe knows where they live, and the
   * two are only in the same place during a run. `/receipts` cannot rebuild
   * this: the basket it shows is derived from settled fills (D50), so a thesis
   * published a minute ago has an empty one there.
   */
  const basket = (state.allocate?.legs ?? []).flatMap((leg) => {
    const found = state.universe?.find((u) => u.symbol === leg.symbol);
    return found ? [{ asset: found.address, symbol: found.symbol }] : [];
  });
  const started = state.running || state.error !== null || state.compile !== null;

  return (
    <>
      <Section title="Your thesis">
        <Composer
          thesis={thesis}
          onThesis={setThesis}
          notional={notional}
          onNotional={setNotional}
          maxImpact={maxImpact}
          onMaxImpact={setMaxImpact}
          running={state.running}
          onStart={run}
          onStop={stop}
        />
      </Section>

      {started && (
        <Section
          title="The run"
          aside={
            // Readable without checking six rows, which is the thing a wait
            // most wants to know and the thing the rows are worst at saying.
            <span className="font-mono text-meta tabular-nums text-dim">
              {STAGES.filter((s) => state.status[s.id] === 'done').length} of {STAGES.length}
            </span>
          }
        >
          <RunTimeline state={state} />
          {state.error && (
            <div className="mt-6">
              <RunError message={state.error} onRetry={run} />
            </div>
          )}
        </Section>
      )}

      {state.plan && (
        <div className="mt-11">
          <RunResult state={state} />
        </div>
      )}

      {state.compile && <ThesisPanel data={state.compile} />}
      {state.allocate && <AllocationPanel allocation={state.allocate} universe={state.universe} />}
      {state.mandate && <MandatePanel mandate={state.mandate} basket={basket} />}
      {state.plan && <PlanPanel plan={state.plan} />}
      {state.oracle && <OraclePanel oracle={state.oracle} />}

      {/* Last, because it is the step taken once the reader believes the rest.
          Publishing binds the claim to a timestamp before anything trades
          against it, which is the ordering `/receipts` spends its whole surface
          proving. */}
      {state.compile && (
        <Section title="Publish it">
          <PublishThesis thesis={state.compile.thesis} basket={basket} />
        </Section>
      )}
    </>
  );
}
