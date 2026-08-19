import { fetchBoard } from '@/src/board-store';
import { Console } from '@/app/components/Console';
import { Hero } from '@/app/components/console/Hero';
import { Figure } from '@/app/components/console/Figure';
import { usd } from '@/app/components/console/board-format';

export const metadata = {
  title: 'Idea · Reckonz',
  description:
    'Write what you think in plain words. We map it onto what trades, size it against the real pools, and tell you what the chain will refuse.',
};

/**
 * Rendered per request, because the figures beside the claim are measured
 * hourly and a page baked at deploy time would quote whatever was true when it
 * shipped.
 */
export const dynamic = 'force-dynamic';

/**
 * The way in: a sentence goes in, a basket the chain will accept comes out.
 *
 * The frame carries facts about the system rather than about the run, because
 * they are true before anyone presses anything. A page that is blank until you
 * act tells a visitor with ninety seconds nothing, and this one used to be: a
 * header, a text box, and six grey pills.
 */
export default async function IdeaPage() {
  const found = await fetchBoard();
  const board = found?.board ?? null;

  const tight = board ? Math.min(...board.capacityLimitsBps) : null;
  const deepest =
    board && tight !== null
      ? board.assets.reduce((best, a) => Math.max(best, a.capacityUsdg[tight] ?? 0), 0)
      : null;
  const priced = board ? board.assets.filter((a) => a.publishable).length : null;

  return (
    <>
      <Hero
        title="Write it in words. Get a basket the chain will accept."
        aside={
          board && priced !== null && deepest !== null && tight !== null ? (
            <div className="flex flex-wrap gap-x-11 gap-y-6 sm:flex-nowrap">
              <Figure label="Priced" value={`${priced} of ${board.assets.length}`}>
                markets with a value we can defend
              </Figure>
              <Figure label="Deepest market" value={usd(deepest)}>
                absorbable at {(tight / 100).toFixed(2)}%
              </Figure>
              <Figure label="Refusals" value={`${board.totals.dry.length}`}>
                markets that can take nothing today
              </Figure>
            </div>
          ) : null
        }
      >
        The model maps it onto what actually trades here, the pools size it, and the guard refuses
        what they cannot take. Nothing is signed on this page.
      </Hero>

      <div className="mt-11">
        <Console />
      </div>
    </>
  );
}
