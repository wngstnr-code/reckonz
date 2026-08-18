import { fetchBoard } from '@/src/board-store';
import { readShowcase } from '@/src/showcase';
import { Board } from '@/app/components/console/Board';
import { HowItWorks } from '@/app/components/console/HowItWorks';
import { VerdictRibbon } from '@/app/components/console/VerdictRibbon';
import { Hero } from '@/app/components/console/Hero';

export const metadata = {
  title: 'Assets · Reckonz',
  description:
    'All 30 tokenised stocks on X Layer, with a fair price we can stand behind, how risky the overnight gap is, and how much each market can really take.',
};

/**
 * Rendered per request rather than baked at build.
 *
 * The board is measured hourly, and a page prerendered once would show whatever
 * was true when it was deployed, for as long as the deployment lived. There is
 * no cheaper answer that stays honest: the numbers here have a date on them,
 * and the date has to be able to move.
 */
export const dynamic = 'force-dynamic';

/**
 * The size every verdict on this page is decided at.
 *
 * $1,000 rather than the smallest rung, because at $250 every tradable asset
 * is allowed and the column says nothing, and a page that opens on a question
 * with only one answer has wasted the reader's first look. The slider moves it
 * from here; this is only where it starts.
 */
const DEFAULT_SIZE_USDG = 1_000;

/**
 * The way into the console, and the argument the product makes.
 *
 * It reads `fetchBoard()` directly rather than calling our own route over HTTP.
 * A server asking itself a question through the network is a round trip that
 * buys nothing, and rendering on the server means the page arrives holding
 * numbers rather than a spinner — which matters most for the visitor who gives
 * it ninety seconds and has no wallet. `GET /api/board` still earns its place:
 * it is the surface an agent can ask, and the one a refresh button will use.
 */
export default async function AssetsPage() {
  const found = await fetchBoard();
  const showcase = readShowcase();
  const renderedAt = Date.now();

  return (
    <>
      <Hero title="Know what this market can take, before you buy">
        All 30 tokenised stocks on X Layer, each with a price we can defend, how risky the
        overnight gap is, and the size we would refuse. You do not need a wallet to read any of it.
      </Hero>

      {found ? (
        <Board
          board={found.board}
          from={found.from}
          defaultSizeUsdg={DEFAULT_SIZE_USDG}
          renderedAt={renderedAt}
        />
      ) : (
        <NoBoard />
      )}

      {showcase && <VerdictRibbon showcase={showcase} now={renderedAt} />}

      <HowItWorks />
    </>
  );
}

/**
 * Never an empty table.
 *
 * A board that has not been measured and a market with nothing in it look
 * identical once they are both rendered as no rows, and only one of them should
 * read as "there is nothing here".
 */
function NoBoard() {
  return (
    <div className="max-w-[62ch] rounded-xl border border-caution/40 bg-caution/6 p-4">
      <h2 className="font-mono text-micro text-caution uppercase">Nothing measured yet</h2>
      <p className="mt-2.5 text-data leading-relaxed text-dim">
        No board has been measured on this deployment. That is not the same as an empty market:
        nothing is being shown because nothing is known. Run <code>pnpm board</code> and commit the
        result, or bring the publish worker up.
      </p>
    </div>
  );
}
