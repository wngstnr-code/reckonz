import { fetchBoard } from '@/src/board-store';
import { Mandate } from '@/app/components/Mandate';
import { MandateManage } from '@/app/components/MandateManage';
import { Limits } from '@/app/components/console/trade/Limits';
import { Section } from '@/app/components/console/trade/Section';
import { TradeCard } from '@/app/components/console/trade/TradeCard';

export const metadata = {
  title: 'Trade · Reckonz',
  description:
    'The part that needs your wallet. You set the rules, the chain enforces them, and no key of ours can move your money.',
};

/**
 * Rendered per request, for the same reason `/assets` is: the limits table is
 * measured hourly, and a page baked at deploy time would show whatever was true
 * when it shipped for as long as the deployment lived.
 */
export const dynamic = 'force-dynamic';

/**
 * The trade surface, laid out the way the reference lays out an asset page:
 * context down the left, the thing you act with sticky on the right.
 *
 * It used to be four panels stacked down one column — create a mandate, manage
 * it, buy, sell — in the order the work happens. That order is right and the
 * shape was wrong: it put the daily act (a fill) below a setup step performed
 * once, and it split buying from selling by a scroll. So the action moved into
 * one card in the rail, the mandate became the document you read beside it, and
 * creating one dropped to the bottom where a once-per-mandate step belongs.
 *
 * Creating a mandate is always last, and always at the page's full width. It is
 * a step taken once per mandate; the daily act is the card in the rail.
 *
 * The panels still talk to each other while they run — a new mandate tells the
 * fill card to re-read the chain, a settled fill tells the manager its positions
 * moved — and those messages are still DOM events between siblings, which is why
 * all of this stays on one route. See `follow.ts`.
 */
export default async function TradePage() {
  const found = await fetchBoard();
  const now = Date.now();

  return (
    <>
      {/* Three cells, so the card's top edge lines up with the page title
          rather than starting a block below it. The heading takes column one on
          its own, the rail takes column two across both rows, and the reading
          column sits under the heading.

          The document order is heading, rail, content, which is also the right
          order stacked: on a narrow screen the title comes first, then the thing
          you came to do, then everything describing it. Doing this with a header
          above the grid could only get one of the two right. */}
      <div className="grid gap-x-14 lg:grid-cols-[minmax(0,1fr)_400px]">
        <header className="mb-9 lg:col-start-1 lg:row-start-1">
          <h1 className="text-title font-semibold tracking-tight">Trade</h1>
          <p className="mt-2.5 max-w-[68ch] text-body text-dim">
            You write the rules. The chain enforces them inside the trade itself, and no key of ours
            can move your money.
          </p>
        </header>

        <div className="mb-11 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mb-0">
          <TradeCard />
        </div>

        <div className="min-w-0 lg:col-start-1 lg:row-start-2">
          <MandateManage />

          <Section title="Limits">
            {found ? (
              <Limits board={found.board} now={now} />
            ) : (
              <p className="max-w-[62ch] text-meta leading-relaxed text-caution">
                No board has been measured on this deployment. That is not the same as an empty
                market: nothing is shown because nothing is known.
              </p>
            )}
          </Section>
        </div>
      </div>

      {/* Outside the grid, so it takes the whole page rather than the reading
          column. Five caps and thirty asset chips are cramped at 940px and
          comfortable at full width, and it is the same shape whether this wallet
          owns a mandate or not: setting one up is a step you take once and then
          scroll past, not a thing to be met with. */}
      <div className="mt-14">
        <Section title="Create a mandate">
          <Mandate />
        </Section>
      </div>
    </>
  );
}
