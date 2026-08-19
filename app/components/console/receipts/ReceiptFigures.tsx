import type { Summary } from '@/src/receipts-view';
import { Figure } from '../Figure';

/**
 * The three numbers a reader should carry away from the provenance page.
 *
 * They follow `BoardFigures`' rule: **a total is never shown alone.** "17 bps"
 * says nothing without how many fills it averaged, and "6 theses" hides that
 * fourteen receipts have none. So every one of these is a fraction, or carries
 * the denominator it was taken over.
 *
 * The middle figure is deliberately the weaker claim. Whether a bundle still
 * re-derives its hash costs a fetch per receipt, and the detail page is where
 * that check runs; this one counts hashes stamped on chain, which is what the
 * registry itself can answer.
 */
export function ReceiptFigures({ summary: s }: { summary: Summary }) {
  return (
    <div className="flex flex-wrap gap-x-11 gap-y-6 sm:flex-nowrap">
      <Figure
        label="Weighted shortfall"
        value={s.weightedSlippageBps === null ? 'unmeasured' : `${s.weightedSlippageBps} bps`}
      >
        {/* Never averaged over fills nothing priced. Saying which ones were left
            out is the difference between a measurement and an average. */}
        over the {s.measuredFills} fills that were measured
      </Figure>

      <Figure label="Evidence" value={`${s.withEvidence} of ${s.receiptCount}`}>
        carry a hash stamped on chain
      </Figure>

      <Figure label="Published first" value={`${s.withThesis} of ${s.receiptCount}`}>
        the reasoning went up before the trade
      </Figure>
    </div>
  );
}
