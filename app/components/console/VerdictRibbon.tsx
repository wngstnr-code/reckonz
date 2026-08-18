import Link from 'next/link';
import type { Showcase } from '@/src/showcase';
import { REFUSAL, freshness, usd, usdExact } from './board-format';

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
 */
export function VerdictRibbon({ showcase, now }: { showcase: Showcase; now: number }) {
  const t = showcase.totals;
  const age = freshness(showcase.recordedAt, now);
  const executable = showcase.verdicts.filter((v) => v.ok).length;

  // The whole reason to plan rather than send. Guarded because a run with
  // nothing placed has nothing to compare, and 0/0 is not a saving.
  const saved = t.naiveCostUsdg - t.plannedCostUsdg;

  return (
    <section className="mt-14 border-t border-line pt-8">
      <h2 className="font-mono text-micro text-faint uppercase">One real idea, priced</h2>

      <p className="mt-3 max-w-[74ch] text-lead leading-relaxed text-ink">
        &ldquo;{showcase.thesis}&rdquo;
      </p>

      <div className="mt-7 flex flex-wrap gap-x-14 gap-y-6">
        <Figure label="Asked for" value={usd(t.askedUsdg)}>
          over {showcase.horizonDays} days
        </Figure>

        <Figure label="Market could take" value={usd(t.placedUsdg)} tone="text-ink">
          {showcase.lines.map((l) => l.symbol).join(', ') || 'nothing'}
        </Figure>

        <Figure label="Not placed" value={usd(t.unallocatedUsdg)} tone="text-caution">
          refused rather than forced in
        </Figure>

        {saved > 0 && (
          <Figure label="Impact avoided" value={usd(saved)} tone="text-signal">
            {usd(t.naiveCostUsdg)} at once, {usdExact(t.plannedCostUsdg)} planned
          </Figure>
        )}
      </div>

      <div className="mt-6 border-t border-line pt-4">
        {executable === showcase.verdicts.length && executable > 0 ? (
          <p className="text-body text-dim">
            The guard would have let{' '}
            <b className="font-semibold text-signal">all {executable}</b> of these through at the
            size the plan proposed.
          </p>
        ) : (
          <p className="max-w-[74ch] text-body leading-relaxed text-dim">
            The guard then refused{' '}
            <b className="font-semibold text-caution">
              {showcase.verdicts.length - executable} of {showcase.verdicts.length}
            </b>{' '}
            even at that size.{' '}
            {showcase.verdicts
              .filter((v) => !v.ok)
              .map((v) => (
                <span key={v.symbol}>
                  {v.symbol} came in at {v.impactBps}bp against a {showcase.maxImpactBps}bp limit,{' '}
                  {REFUSAL[v.reason ?? ''] ?? v.reason}.{' '}
                </span>
              ))}
            The plan already sizes under the limit rather than up to it, so a refusal here means
            this market moved further than that headroom between the sizing and the check. Nothing
            off chain gets to overrule the guard.
          </p>
        )}
      </div>

      <p className="mt-4 flex flex-wrap items-center gap-x-2 font-mono text-meta text-faint">
        <span>
          recorded {age.label} ·{' '}
          {new Date(showcase.recordedAt * 1000).toISOString().slice(0, 16).replace('T', ' ')}Z ·
          compiled by {showcase.provider} · {showcase.maxImpactBps}bp impact limit
        </span>

        {/* The absolute stamp sits beside the relative one because this is a
            server component: the label is correct when the page is built and
            drifts while a tab stays open. The date does not. */}
        <Link
          href="/idea"
          className="text-dim underline underline-offset-3 transition-colors duration-200 hover:text-ink"
        >
          price your own
        </Link>
      </p>

      {age.level !== 'current' && (
        <p className="mt-2 max-w-[62ch] text-data text-caution">
          Depth moves within hours, so this run describes the market it was recorded against rather
          than today&rsquo;s. Write your own on the Idea page to price it now.
        </p>
      )}
    </section>
  );
}

function Figure({
  label,
  value,
  tone = 'text-ink',
  children,
}: {
  label: string;
  value: string;
  tone?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="font-mono text-micro text-faint uppercase">{label}</div>
      <div className={`mt-1 font-mono text-title font-semibold ${tone}`}>{value}</div>
      <div className="mt-0.5 text-data text-dim">{children}</div>
    </div>
  );
}
