import type { Showcase } from '@/src/showcase';
import { Figure } from './Figure';
import { freshness, usd, usdExact } from './board-format';

/**
 * The board above, applied to one real idea, in the numbers that decide it.
 *
 * A visitor with no wallet can read the whole argument here without spending an
 * LLM quota or waiting half a minute for a live run. It is a recording of a run
 * that actually happened — live compiler, real universe, real pool walk, the
 * same guard the contract runs — and `parseShowcase` refuses to render one that
 * was produced by the fixture.
 *
 * **Nothing flattering is selected.** The recording is whatever `pnpm showcase`
 * last produced, kept as it came out, and both outcomes are rendered as found.
 * Re-running until the numbers read well would turn a measurement into a
 * selection, which is the same failure as quoting a capacity figure without its
 * date.
 *
 * It is re-recorded when the *system* changes, which is a different thing. The
 * first recording refused its only leg: `capacity()` solved for the largest
 * size still inside the guard's limit, so it landed on the boundary, and the
 * pool drifted between the sizing and the check. That was a finding, not a
 * result — `PLAN_HEADROOM` now keeps the plan at 90% of the limit (D89) — and
 * leaving the old recording up would have had this page explain a cause that
 * no longer exists.
 *
 * **The unplaced amount is stated, never buried.** It is usually most of the
 * notional, it is the market's answer rather than a shortfall, and a recording
 * that kept only the placed half would be marketing wearing a measurement's
 * clothes.
 *
 * ## The frame, and what it cost
 *
 * This was a bare section under a rule: an eyebrow, the quote, four figures, a
 * paragraph explaining the guard's verdict, a metadata line and a warning. Six
 * blocks of type for one recording, on a page whose argument is the board above
 * it. It is the same green frame the page opens on now — one claim, the numbers
 * that back it, nothing else — so the recording reads as a second exhibit
 * rather than as an essay appended to the board.
 *
 * **The figures lost their colours, and that is the rule rather than a
 * casualty.** `caution` on `--color-frame` measures under 2:1; D101 is exactly
 * this mistake, found on a green panel three times. Inside the frame every
 * number is `cta-ink` and the caption under it carries the meaning, which is
 * what the shared `Figure` already does for the board's own three.
 *
 * **The quote sits above the figures rather than beside them.** The `Hero` puts
 * its claim on the left and its numbers on the right, and that shape cannot
 * hold this: a thesis runs to about 180 characters, so two lines of it needs
 * roughly 90 characters of width, and there is no laptop wide enough to put
 * that beside four figures. Stacked is the same frame in its own narrow-width
 * arrangement, not a second design.
 */
export function VerdictRibbon({ showcase, now }: { showcase: Showcase; now: number }) {
  const t = showcase.totals;
  const age = freshness(showcase.recordedAt, now);

  // The whole reason to plan rather than send. Guarded because a run with
  // nothing placed has nothing to compare, and 0/0 is not a saving.
  const saved = t.naiveCostUsdg - t.plannedCostUsdg;

  return (
    <section className="mt-14 rounded-2xl bg-frame px-8 py-9 md:px-11 md:py-10">
      {/* Held to two lines at reading width. The frame is a claim, and the
          thesis is the claim here — so it takes the position and the size the
          `Hero`'s title takes, rather than being introduced by a label. */}
      <p className="max-w-[92ch] text-[21px] leading-tight font-semibold text-cta-ink">
        &ldquo;{showcase.thesis}&rdquo;
      </p>

      <div className="mt-8 flex flex-wrap gap-x-11 gap-y-6 sm:flex-nowrap">
        <Figure label="Asked for" value={usd(t.askedUsdg)}>
          over {showcase.horizonDays} days
        </Figure>

        <Figure label="Market could take" value={usd(t.placedUsdg)}>
          {showcase.lines.map((l) => l.symbol).join(', ') || 'nothing'}
        </Figure>

        <Figure label="Not placed" value={usd(t.unallocatedUsdg)}>
          refused rather than forced in
        </Figure>

        {saved > 0 && (
          <Figure label="Impact avoided" value={usd(saved)}>
            {usd(t.naiveCostUsdg)} at once, {usdExact(t.plannedCostUsdg)} planned
          </Figure>
        )}
      </div>

      {/* One line, and the one piece of prose that could not go.
       *
       * `Market could take` is a capacity figure, and D84's rule is that a
       * capacity figure is a measurement with a date — the same board went
       * $17.5M to $22.9M in four days, and nine pools that `pnpm capacity`
       * priced were empty hours later. An undated number here would read as a
       * standing property of the market rather than as what this run found at
       * that hour. The paragraph explaining that is gone; the date is not. */}
      <p className="mt-8 font-mono text-fine text-cta-3">
        recorded {age.label} ·{' '}
        {new Date(showcase.recordedAt * 1000).toISOString().slice(0, 16).replace('T', ' ')}Z ·{' '}
        {showcase.maxImpactBps}bp impact limit
      </p>
    </section>
  );
}
