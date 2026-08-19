import Link from 'next/link';
import type { Route } from 'next';
import type { WireThesis } from '@/src/receipts-view';
import { Bar } from '../../ui';
import { usdg, when } from './format';

/**
 * The published ideas, as a list rather than as cards.
 *
 * A thesis is not a receipt and does not get the grid. Its record spans several
 * receipts, so it cannot live inside any one of them, and there are three of
 * them against twenty receipts: a card grid of three beside a card grid of
 * twenty would say the three matter more, which is the inversion this page was
 * rebuilt to undo.
 *
 * It carries no receipt detail. That used to be copied in full under every
 * thesis, so a fill with a thesis was rendered twice and a fill without one was
 * rendered in a footnote. Now the thesis links to its receipts and the receipts
 * hold their own facts.
 */
export function Theses({ theses }: { theses: WireThesis[] }) {
  if (theses.length === 0) {
    return <p className="text-data text-dim">No thesis has been published yet.</p>;
  }

  return (
    <ul className="grid">
      {theses.map((t) => (
        <li key={t.id} className="border-b border-line/60 py-5 first:pt-0 last:border-b-0">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            {/* Not a link. A thesis has no page of its own: everything it can
                say is on this row, and the one action it carries -- following
                its basket -- lives on the detail of any receipt that executed
                it, where the fill that proves it sits beside it. */}
            <span className="font-mono text-data font-semibold text-ink">thesis #{t.id}</span>
            <span className="font-mono text-micro text-faint">
              published {when(t.publishedAt)}
            </span>
            {/* The claim, stated as a fact the chain settles rather than as a
                badge. It is the only thing on this page that could be false. */}
            {t.record.fillCount === 0 ? (
              <span className="text-meta text-caution">nothing has executed against it</span>
            ) : t.publishedBeforeExecution ? (
              <span className="text-meta text-signal">published before every fill</span>
            ) : (
              <span className="text-meta text-refuse">
                a fill predates it, so the ordering claim does not hold
              </span>
            )}
          </div>

          {t.basket.length > 0 && (
            <ul className="mt-3 grid gap-1">
              {t.basket.map((b) => (
                <li
                  key={b.asset}
                  className="flex flex-wrap items-baseline gap-3 font-mono text-meta tabular-nums"
                >
                  <span className="w-20 text-dim">{b.symbol}</span>
                  <span className="w-16 text-right text-ink">
                    {(b.weightBps / 100).toFixed(2)}%
                  </span>
                  <Bar value={b.weightBps / 10_000} />
                  <span className="w-28 text-right text-faint">{usdg(b.notionalUsdg)} USDG</span>
                </li>
              ))}
            </ul>
          )}

          {t.record.fillCount > 0 && (
            <p className="mt-3 font-mono text-meta tabular-nums text-dim">
              {usdg(t.record.notionalUsdg)} USDG · {t.record.entryCount} entr
              {t.record.entryCount === 1 ? 'y' : 'ies'} · {t.record.exitCount} exit
              {t.record.exitCount === 1 ? '' : 's'} · {t.record.weightedSlippageBps} bps weighted
            </p>
          )}

          {t.receipts.length > 0 && (
            <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-meta text-dim">
              <span className="text-faint">receipts</span>
              {t.receipts.map((r) => (
                <Link
                  key={r.id}
                  href={`/receipts/${r.id}` as Route}
                  className="font-mono underline decoration-dotted hover:text-ink"
                >
                  #{r.id}
                </Link>
              ))}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
