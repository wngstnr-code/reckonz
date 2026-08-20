import { loadRegistry } from '@/src/track-record';
import { allReceipts, summarise, toWire } from '@/src/receipts-view';
import { Hero } from '@/app/components/console/Hero';
import { Section } from '@/app/components/console/trade/Section';
import { Integrity } from '@/app/components/console/receipts/Integrity';
import { ReceiptFigures } from '@/app/components/console/receipts/ReceiptFigures';
import { ReceiptsView } from '@/app/components/console/receipts/ReceiptsView';
import { Unreadable } from '@/app/components/console/receipts/Unreadable';
import { Theses } from '@/app/components/console/receipts/Theses';

export const metadata = {
  title: 'Receipts · Reckonz',
  description:
    'Every fill this system has settled, and the reasoning that came before it. The claim goes on chain first, so nobody can rewrite it afterwards.',
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * What the chain recorded, receipt first.
 *
 * It read `GET /api/theses` from the browser and opened on a spinner. It reads
 * `loadRegistry()` directly now, for the reason `/assets` does: a server asking
 * itself a question over HTTP is a round trip that buys nothing, and a visitor
 * with ninety seconds and no wallet should get numbers rather than a loading
 * line. The route still earns its place as the surface an agent can ask.
 *
 * **Receipts are the grid; theses are a list above it.** Twenty receipts exist
 * and six carry a thesis. Built around theses, the page rendered those six in
 * full and gave the other fourteen one line each holding a symbol and a
 * timestamp — no price, no shortfall, no evidence, no link. A page whose header
 * says losses stay up as long as wins do cannot be shaped that way.
 */
export default async function ReceiptsPage() {
  const snapshot = await loadRegistry().then(toWire).catch(() => null);

  if (!snapshot) return <Unreadable />;

  const receipts = allReceipts(snapshot);
  const summary = summarise(snapshot);

  return (
    <>
      <Hero
        title="Every fill, and the reasoning that came first"
        aside={<ReceiptFigures summary={summary} />}
      >
        The claim is published on chain before the trade, and the evidence is hashed into the
        receipt. Losses stay on this page as long as the wins do.
      </Hero>

      {/* Above the grid, because it is what the page claims and the grid is what
          backs it up. A reader who meets twenty receipts first has to hold them
          in mind until something explains what they were for. */}
      <Section
        title="Theses"
        aside={
          <span className="text-meta text-dim">
            {snapshot.theses.length} published, {summary.withThesis} of {summary.receiptCount}{' '}
            receipts carry one
          </span>
        }
      >
        <Theses theses={snapshot.theses} />
      </Section>

      <Section
        title="Receipts"
        aside={<span className="text-meta text-dim">{summary.receiptCount} settled</span>}
      >
        <ReceiptsView receipts={receipts} />
      </Section>

      <Section title="Integrity">
        <Integrity snapshot={snapshot} summary={summary} />
      </Section>
    </>
  );
}
