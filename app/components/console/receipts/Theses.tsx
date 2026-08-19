'use client';

import { useState } from 'react';
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
 *
 * **Each one is a row across, not a block down.** Stacked, three theses already
 * ran most of a screen and thirty would run ten, which is the shape that turns a
 * list into a scroll. The four things a thesis says -- who and when, what it
 * held, what it did, where the proof is -- are independent, so they sit in four
 * columns and the row is as tall as its tallest basket. It collapses back to the
 * stack below `lg`, where four columns would be four words wide.
 *
 * **Capped rather than paginated.** Sitting above the receipts grid, an
 * unbounded list would push the page's main content off the screen. Pages would
 * be the wrong answer to that: receipts are evidence that gets browsed and
 * theses are narrative that gets read, and cutting reading into numbered chunks
 * to be navigated serves neither. A disclosure keeps the whole list one click
 * away and costs no route. Theses also grow far more slowly than receipts --
 * every fill makes one of those, only a published idea makes one of these -- so
 * the cap will bind rarely.
 */

/** Five rows: enough to show the shape of the record, short enough to scroll past. */
const MAX_SHOWN = 5;

export function Theses({ theses }: { theses: WireThesis[] }) {
  const [all, setAll] = useState(false);

  if (theses.length === 0) {
    return <p className="text-data text-dim">No thesis has been published yet.</p>;
  }

  // Newest first, so the cap hides the oldest rather than the latest thinking.
  const ordered = [...theses].sort((a, b) => b.publishedAt - a.publishedAt);
  const shown = all ? ordered : ordered.slice(0, MAX_SHOWN);
  const hidden = ordered.length - shown.length;

  return (
    <>
    <ul className="grid">
      {shown.map((t) => (
        <li
          key={t.id}
          className="grid gap-x-10 gap-y-4 border-b border-line/60 py-5 first:pt-0 last:border-b-0 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_minmax(0,13rem)_auto]"
        >
          <div>
            {/* Not a link. A thesis has no page of its own: everything it can
                say is in this row, and the one action it carries -- following
                its basket -- lives on the detail of any receipt that executed
                it, where the fill that proves it sits beside it. */}
            <div className="font-mono text-data font-semibold text-ink">thesis #{t.id}</div>
            <div className="mt-1 font-mono text-micro text-faint">
              published {when(t.publishedAt)}
            </div>
            {/* The only thing on this page that could be false, so it is stated
                as a fact the chain settles rather than dressed as a badge. */}
            <div className="mt-1.5 text-meta">
              {t.record.fillCount === 0 ? (
                <span className="text-caution">nothing has executed against it</span>
              ) : t.publishedBeforeExecution ? (
                <span className="text-signal">published before every fill</span>
              ) : (
                <span className="text-refuse">a fill predates it, so the claim fails</span>
              )}
            </div>
          </div>

          <ul className="grid gap-1 self-start">
            {t.basket.map((b) => (
              <li
                key={b.asset}
                className="flex flex-wrap items-baseline gap-3 font-mono text-meta tabular-nums"
              >
                <span className="w-20 text-dim">{b.symbol}</span>
                <span className="w-16 text-right text-ink">{(b.weightBps / 100).toFixed(2)}%</span>
                <Bar value={b.weightBps / 10_000} />
                <span className="w-28 text-right text-faint">{usdg(b.notionalUsdg)} USDG</span>
              </li>
            ))}
          </ul>

          <div className="self-start font-mono text-meta tabular-nums text-dim">
            {t.record.fillCount > 0 ? (
              <>
                <div className="text-ink">{usdg(t.record.notionalUsdg)} USDG</div>
                <div className="mt-1">
                  {t.record.entryCount} entr{t.record.entryCount === 1 ? 'y' : 'ies'} ·{' '}
                  {t.record.exitCount} exit{t.record.exitCount === 1 ? '' : 's'}
                </div>
                <div className="mt-1">{t.record.weightedSlippageBps} bps weighted</div>
              </>
            ) : (
              <span className="text-faint">no record yet</span>
            )}
          </div>

          {t.receipts.length > 0 && (
            <div className="self-start lg:text-right">
              <div className="text-micro text-faint uppercase">receipts</div>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 lg:justify-end">
                {t.receipts.map((r) => (
                  <Link
                    key={r.id}
                    href={`/receipts/${r.id}` as Route}
                    className="font-mono text-meta text-dim underline decoration-dotted hover:text-ink"
                  >
                    #{r.id}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>

    {(hidden > 0 || all) && (
      <button
        type="button"
        onClick={() => setAll(!all)}
        className="mt-5 text-meta text-dim underline decoration-dotted transition-colors duration-200 hover:text-ink"
      >
        {all ? 'Show the latest five' : `Show ${hidden} older thes${hidden === 1 ? 'is' : 'es'}`}
      </button>
    )}
    </>
  );
}
