import Link from 'next/link';
import type { Route } from 'next';
import type { ViewReceipt } from '@/src/receipts-view';
import { hasEvidence } from '@/src/receipts-view';
import { AssetMark } from '../AssetMark';
import { TONE, direction, e8, headline, notionalOf, toneOf, usdg, when } from './format';

/**
 * One settled receipt, in the shape `AssetCard` uses.
 *
 * Mark and symbol on top, a tinted block below carrying a headline number, a
 * supporting line, and the facts that qualify it. Same skeleton on purpose: a
 * reader arriving from `/assets` should not have to learn a second card.
 *
 * **The headline is the shortfall, not the amount.** What this cost is on the
 * explorer already; how far it landed from the value the oracle would defend is
 * the number only this system recorded, and it is the claim the product makes.
 *
 * **The tint is about the record, not about money.** Green means measured and
 * within policy. It never means the trade made anything, because none of these
 * pages know that and inventing it is the one thing they must not do.
 */
export function ReceiptCard({ receipt }: { receipt: ViewReceipt }) {
  const tone = TONE[toneOf(receipt)];
  const head = headline(receipt);
  const first = receipt.fills[0];
  const many = receipt.fills.length > 1;

  return (
    <Link
      href={`/receipts/${receipt.id}` as Route}
      className="block rounded-2xl border border-line bg-ground p-4 transition-colors duration-200 hover:border-faint"
    >
      <header className="flex items-center gap-3">
        {first ? <AssetMark symbol={first.symbol} /> : null}
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-data font-semibold text-ink">
            {many ? `${receipt.fills.length} assets` : (first?.symbol ?? 'n/a')}
          </div>
          <div className="truncate text-micro tracking-normal text-faint normal-case">
            receipt #{receipt.id} · {direction(receipt.fills)}
          </div>
        </div>
      </header>

      <div className={`mt-4 rounded-xl p-4 ${tone.tint}`}>
        <div className="font-mono text-title font-semibold text-ink">{head.value}</div>
        <div className={`mt-0.5 text-data ${tone.text}`}>{head.note}</div>

        <div className="mt-4 font-mono text-meta tabular-nums text-dim">
          {usdg(notionalOf(receipt))} USDG
        </div>
        <div className="mt-0.5 font-mono text-micro tracking-normal text-faint normal-case">
          {first && !many
            ? `at ${e8(first.executionPriceE8)} · gap ${first.gapRisk}`
            : `across ${receipt.fills.length} legs`}
        </div>

        {/* Only the departures.
        
            Every card carried "no thesis" and "evidence stamped", two labels
            that are the same on most of them, and sixteen copies of a constant
            is texture rather than information. What a reader needs to find at a
            glance is the card that differs: the one with a thesis behind it, and
            the one nothing can ever audit. A card with neither mark is the
            ordinary case and says so by staying quiet.
            
            Stamped, not verified: checking the bundle costs a fetch per receipt
            and this grid renders sixteen. The detail page does the checking, so
            the weaker word is the honest one here. */}
        {(receipt.thesisId !== null || !hasEvidence(receipt)) && (
          <div className="mt-4 flex items-baseline justify-between gap-3 font-mono text-micro text-faint">
            <span>{receipt.thesisId === null ? '' : `thesis #${receipt.thesisId}`}</span>
            {!hasEvidence(receipt) && <span className="text-refuse">no evidence</span>}
          </div>
        )}
      </div>

      <div className="mt-3 font-mono text-micro tracking-normal text-faint normal-case">
        {when(receipt.timestamp)}
      </div>
    </Link>
  );
}
