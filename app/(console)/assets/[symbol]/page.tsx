import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fetchBoard } from '@/src/board-store';
import { MAINNET } from '@/src/deployments';
import { AssetDetail } from '@/app/components/console/AssetDetail';

/**
 * One asset, with everything the board already measured about it.
 *
 * The grid answers "what is this" and the table answers "how does it compare".
 * Neither can answer "why", because the reasons are per asset and there are
 * eight of them: a ladder of eight quoted sizes, four capacity limits, four
 * components of gap risk, and whatever the engine wrote in its notes. A card
 * that carried all of that would stop being a card.
 *
 * Nothing here is measured on request. Every number on this page was already in
 * the payload the board shipped, which is why a page about one asset costs the
 * same as the page about thirty.
 */
export const dynamic = 'force-dynamic';

type Params = Promise<{ symbol: string }>;

async function find(symbol: string) {
  const found = await fetchBoard();
  if (!found) return null;
  // Case-insensitive because the URL is typed by people and pasted by them
  // too, and `wtslax` is not a different asset from `wTSLAx`.
  const asset = found.board.assets.find((a) => a.symbol.toLowerCase() === symbol.toLowerCase());
  return asset ? { asset, board: found.board, from: found.from } : null;
}

export async function generateMetadata({ params }: { params: Params }) {
  const { symbol } = await params;
  const found = await find(symbol);
  if (!found) return { title: 'Not found · Reckonz' };

  const { asset } = found;
  return {
    title: `${asset.symbol} · Reckonz`,
    description: `${asset.name ?? asset.symbol} on X Layer: what it is worth, how risky the overnight gap is, and how much this market can take before it moves against you.`,
  };
}

export default async function AssetPage({ params }: { params: Params }) {
  const { symbol } = await params;
  const found = await find(symbol);

  // A symbol nobody measured and a board that has not been measured are both
  // "no page here". Only the second is our fault, and neither is worth an empty
  // shell of headings with nothing under them.
  if (!found) notFound();

  return (
    <>
      <Link
        href="/assets"
        className="font-mono text-meta text-dim transition-colors duration-200 hover:text-ink"
      >
        ← All assets
      </Link>

      <AssetDetail
        asset={found.asset}
        board={found.board}
        explorer={MAINNET?.explorer ?? null}
        renderedAt={Date.now()}
      />
    </>
  );
}
