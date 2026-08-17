import { notFound } from 'next/navigation';
import {
  HEALTH_TONES,
  HealthBadge,
  healthLabel,
  healthSentence,
  type HealthTone,
} from '@/app/components/console/HealthBadge';

/**
 * A gallery for states that cannot be summoned by waiting.
 *
 * Four of the five health states need a condition nobody can arrange on
 * demand: `live` needs a funded publisher that has run in the last fifteen
 * minutes, `unreachable` needs our own route to be broken. Judging a design by
 * whichever state happens to be true today is judging one fifth of it.
 *
 * Not a user-facing page and never shipped: `notFound()` in production means it
 * does not exist outside `next dev`, so the rule that every route does
 * something real still holds. It is also deliberately not in the navigation —
 * this is a workbench for the two of us, and it grows as the primitives do.
 */
export const metadata = { title: 'Preview · Reckonz' };

/* Keyed by the state the route reports, not by the word shown on screen. Those
   differ on purpose: `ok` renders as `live`, `down` renders as `stale`. */
const WHEN: Record<HealthTone, string> = {
  ok: 'The publisher has run recently and every allowed asset has a fresh, usable price.',
  degraded:
    'Some assets are stale, or the evidence archive is unconfigured, or the compiler has no key. A trade can still go through.',
  down: 'Nothing can execute. Either the chain is unreachable, or every allowed asset has a price too old to trade against. This is what is true right now.',
  unknown: 'The browser asked and got nothing back. Our own status check is down, or you are offline.',
  loading: 'The first half second of every page load, before the first answer arrives.',
};

export default function PreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <div>
      <p className="font-mono text-micro text-faint uppercase">Workbench · development only</p>
      <h1 className="mt-2.5 text-title font-semibold">Preview</h1>
      <p className="mt-3 max-w-[62ch] text-body text-dim">
        Every state a component can be in, side by side, including the ones the real system will
        not show you today. This page does not exist in production.
      </p>

      <h2 className="mt-10 border-b border-line pb-2.5 font-mono text-micro text-faint uppercase">
        Health badge
      </h2>

      {/* In the bar it actually lives in, at the size it actually renders. A
          badge judged on a page background is a badge judged in the wrong
          place. */}
      <div className="mt-5 overflow-hidden rounded-xl border border-line">
        {HEALTH_TONES.map((tone) => (
          <div
            key={tone}
            className="flex items-center gap-4 border-b border-line bg-ground px-5 py-2.5 last:border-b-0"
          >
            <span className="w-28 shrink-0 font-mono text-meta text-faint">{tone}</span>
            <HealthBadge tone={tone} />
            <span className="font-mono text-meta text-faint">{healthLabel(tone)}</span>
            <span className="ml-auto font-mono text-meta text-faint">connect wallet</span>
          </div>
        ))}
      </div>

      <ol className="mt-8">
        {HEALTH_TONES.map((tone) => (
          <li key={tone} className="grid gap-2 border-b border-line/60 py-4 last:border-b-0 md:grid-cols-[10rem_1fr]">
            <span className="flex items-center gap-2 font-mono text-meta text-faint">
              <HealthBadge tone={tone} />
              {healthLabel(tone)}
            </span>
            <div>
              <p className="text-data text-dim">
                <span className="text-faint">When: </span>
                {WHEN[tone]}
              </p>
              <p className="mt-1.5 text-data text-ink">
                <span className="text-faint">On hover: </span>
                {healthSentence(tone)}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-10 max-w-[62ch] text-data text-faint">
        More lands here as it gets built: the verdict pill and its refusal reasons, the withheld
        marker, the gap risk bar, empty and error states for the table.
      </p>
    </div>
  );
}
