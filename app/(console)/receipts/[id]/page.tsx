import Link from 'next/link';
import { notFound } from 'next/navigation';
import { checkEvidence } from '@/src/evidence';
import { MAINNET } from '@/src/deployments';
import { findReceipt, toWire } from '@/src/receipts-view';
import { loadRegistry } from '@/src/track-record';
import { ReceiptDetail } from '@/app/components/console/receipts/ReceiptDetail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Params = Promise<{ id: string }>;

async function find(raw: string) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 0) return null;

  const wire = await loadRegistry()
    .then(toWire)
    .catch(() => null);
  if (!wire) return null;

  const receipt = findReceipt(wire, id);
  if (!receipt) return null;

  const thesis = wire.theses.find((t) => t.id === receipt.thesisId) ?? null;
  return { receipt, thesis };
}

export async function generateMetadata({ params }: { params: Params }) {
  const { id } = await params;
  const found = await find(id);
  if (!found) return { title: 'Not found · Reckonz' };

  const symbols = [...new Set(found.receipt.fills.map((f) => f.symbol))].join(', ');
  return {
    title: `Receipt #${found.receipt.id} · Reckonz`,
    description: `${symbols} on X Layer: what it settled at, how far that sat from fair value, and whether the evidence behind the decision still checks out.`,
  };
}

/**
 * One receipt, checked.
 *
 * The evidence hash is re-derived here rather than on the index. A fetch per
 * receipt across twenty cards would make the page that proves the fills the
 * slowest one in the console; a page about a single receipt can afford exactly
 * one, and the check is the only thing on this route the index cannot claim.
 */
export default async function ReceiptPage({ params }: { params: Params }) {
  const { id } = await params;
  const found = await find(id);

  // A receipt nobody settled and a registry that could not be read are both
  // "no page here", and neither is worth a shell of headings with nothing in
  // them. Only the second is our fault, and the index says so when it happens.
  if (!found) notFound();

  const evidence = await checkEvidence(found.receipt.evidenceHash);

  return (
    <>
      <Link
        href="/receipts"
        className="font-mono text-meta text-dim transition-colors duration-200 hover:text-ink"
      >
        ← All receipts
      </Link>

      <div className="mt-9">
        <ReceiptDetail
          receipt={found.receipt}
          thesis={found.thesis}
          evidence={evidence}
          explorer={MAINNET?.explorer ?? null}
          registry={MAINNET?.contracts.ReceiptRegistry ?? null}
        />
      </div>
    </>
  );
}
