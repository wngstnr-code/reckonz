import Link from 'next/link';
import { notFound } from 'next/navigation';
import { checkEvidence } from '@/src/evidence';
import { MAINNET } from '@/src/deployments';
import { findReceipt, toWire } from '@/src/receipts-view';
import type { ViewReceipt, WireThesis } from '@/src/receipts-view';
import { loadRegistry } from '@/src/track-record';
import { ReceiptDetail } from '@/app/components/console/receipts/ReceiptDetail';
import { Unreadable } from '@/app/components/console/receipts/Unreadable';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Params = Promise<{ id: string }>;

/**
 * Three answers, not two.
 *
 * This returned `null` for both "no such receipt" and "the registry would not
 * read", and the page turned that single null into a 404 — so a throttled RPC
 * told the reader the receipt does not exist. One of those is a fact about the
 * chain and the other is a fact about our connection to it, and the reader
 * cannot tell them apart from a page that says `This page could not be found`.
 *
 * `unreadable` is the one that is our fault. Note the ordering: the read has to
 * fail before anything can be said about whether the receipt is there, so a
 * failed read can never be reported as a missing receipt.
 */
type Lookup =
  | { kind: 'ok'; id: number; receipt: ViewReceipt; thesis: WireThesis | null }
  | { kind: 'missing' }
  | { kind: 'unreadable'; id: number };

async function find(raw: string): Promise<Lookup> {
  const id = Number(raw);
  // Not a receipt id at all. Nothing to read, and nothing that could go wrong
  // on our side, so this one really is a 404.
  if (!Number.isInteger(id) || id < 0) return { kind: 'missing' };

  const wire = await loadRegistry()
    .then(toWire)
    .catch(() => null);
  if (!wire) return { kind: 'unreadable', id };

  const receipt = findReceipt(wire, id);
  if (!receipt) return { kind: 'missing' };

  const thesis = wire.theses.find((t) => t.id === receipt.thesisId) ?? null;
  return { kind: 'ok', id, receipt, thesis };
}

export async function generateMetadata({ params }: { params: Params }) {
  const { id } = await params;
  const found = await find(id);
  // Three states, three titles. A tab reading "Not found" over a page that says
  // the registry would not read is the same conflation one layer out.
  if (found.kind === 'missing') return { title: 'Not found · Reckonz' };
  if (found.kind === 'unreadable') return { title: `Receipt #${found.id} · Reckonz` };

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

  // Only a receipt nobody settled is a 404. A registry that would not read is
  // our failure, not the chain's answer, and it gets the same panel the index
  // has always shown rather than a sentence claiming the receipt is not there.
  if (found.kind === 'missing') notFound();

  if (found.kind === 'unreadable') {
    return (
      <>
        <BackLink />
        <div className="mt-9">
          <Unreadable id={found.id} />
        </div>
      </>
    );
  }

  const evidence = await checkEvidence(found.receipt.evidenceHash);

  return (
    <>
      <BackLink />

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

/** The way out, and it is the same one from either state. */
function BackLink() {
  return (
    <Link
      href="/receipts"
      className="font-mono text-meta text-dim transition-colors duration-200 hover:text-ink"
    >
      ← All receipts
    </Link>
  );
}
