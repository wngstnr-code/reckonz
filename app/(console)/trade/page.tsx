import { fetchBoard } from "@/src/board-store";
import { MandateManage } from "@/app/components/MandateManage";
import { CreateMandateSlot } from "@/app/components/console/trade/CreateMandateSlot";
import { Limits } from "@/app/components/console/trade/Limits";
import { Section } from "@/app/components/console/trade/Section";
import { TradeCard } from "@/app/components/console/trade/TradeCard";

export const metadata = {
  title: "Trade · Reckonz",
  description:
    "The part that needs your wallet. You set the rules, the chain enforces them, and no key of ours can move your money.",
};

/**
 * Rendered per request, for the same reason `/assets` is: the limits table is
 * measured hourly, and a page baked at deploy time would show whatever was true
 * when it shipped for as long as the deployment lived.
 */
export const dynamic = "force-dynamic";

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
 * Creating a mandate moves: it is the first thing in the left column for a
 * wallet that owns none, because nothing else on the page works until it is
 * used, and the last thing on the page for a wallet that already has one.
 *
 * The panels still talk to each other while they run — a new mandate tells the
 * fill card to re-read the chain, a settled fill tells the manager its positions
 * moved — and those messages are still DOM events between siblings, which is why
 * all of this stays on one route. See `follow.ts`.
 */
export default async function TradePage() {
  const found = await fetchBoard();
  const now = Date.now();

  // Depth and a defensible price, both. Either alone overstates it: a market
  // with liquidity and no price refuses on `NO_REFERENCE`, and a price with no
  // pool has nothing to fill against.
  const tradable = found
    ? found.board.assets.filter((a) => a.depth === "ok" && a.publishable).length
    : null;

  return (
    <>
      <header className="mb-9 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="text-title font-semibold tracking-tight">Trade</h1>
          <p className="mt-2.5 max-w-[68ch] text-body text-dim">
            The one surface that needs your wallet. You write the rules, the
            chain enforces them inside the trade itself, and a trade that breaks
            them is undone before it settles. No key of ours can move your
            money, and nothing is signed on your behalf.
          </p>
        </div>

        {/* The reference marks the asset open or closed here. Ours marks how much
            of the board could actually be filled — a truer version of the same
            claim, and one this page can defend from a measurement. */}
        {found && (
          <span className="flex items-center gap-2 rounded-full border border-line bg-panel px-3.5 py-1">
            <span
              className={`h-1.5 w-1.5 rounded-full ${tradable ? "bg-signal" : "bg-caution"}`}
              aria-hidden
            />
            <span className="font-mono text-[12.5px] whitespace-nowrap text-dim">
              {tradable} of {found.board.assets.length} tradable
            </span>
          </span>
        )}
      </header>

      <div className="grid gap-x-14 gap-y-11 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* First in the document and second in the grid: on a narrow screen the
            thing you came to do should not be below everything describing it. */}
        <div className="lg:order-2">
          <TradeCard />
        </div>

        <div className="min-w-0 lg:order-1">
          {/* Above the mandate it creates, and only while there is none to
              describe. See `CreateMandateSlot`. */}
          <CreateMandateSlot position="top" />
          <MandateManage />

          <Section title="Limits">
            {found ? (
              <Limits board={found.board} now={now} />
            ) : (
              <p className="max-w-[62ch] text-meta leading-relaxed text-caution">
                No board has been measured on this deployment. That is not the
                same as an empty market: nothing is shown because nothing is
                known.
              </p>
            )}
          </Section>
        </div>
      </div>

      <CreateMandateSlot position="bottom" />
    </>
  );
}
