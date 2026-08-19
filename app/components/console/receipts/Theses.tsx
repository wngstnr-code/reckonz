'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import type { WireThesis } from '@/src/receipts-view';
import { Bar } from '../../ui';
import { Pagination } from '../Pagination';
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
 * **Paginated, but only once it has to be.** This first showed five with a
 * "show the rest" disclosure, on the argument that receipts are evidence to be
 * browsed while theses are narrative to be read. That argument has a ceiling and
 * does not survive it: at two hundred theses the disclosure dumps a hundred and
 * ninety-five rows in one click, which is worse than pages rather than better,
 * and "read them all" has stopped being a thing anyone does. The distinction
 * that justified the disclosure dissolves at exactly the size that made the
 * question worth asking.
 *
 * So the same bar the receipts grid uses, and nothing at all below the
 * threshold: under it there are no controls to explain, and the section heading
 * already says how many exist.
 */

/**
 * Four rows before the bar appears.
 *
 * A thesis row is three lines tall and the grid below it is the page's main
 * content, so this is set by how much can sit above that without pushing it off
 * the screen rather than by how many rows read comfortably. Four is roughly a
 * third of the viewport at the widest breakpoint.
 */
const PAGE_SIZE = 4;

export function Theses({ theses }: { theses: WireThesis[] }) {
  const [page, setPage] = useState(1);

  if (theses.length === 0) {
    return <p className="text-data text-dim">No thesis has been published yet.</p>;
  }

  // Newest first, so page one is the latest thinking rather than the oldest.
  const ordered = [...theses].sort((a, b) => b.publishedAt - a.publishedAt);
  const pages = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const shown = ordered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

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

    {/* Nothing at all while they fit. A page bar reading "1-3 of 3" is a
        control that does nothing, under a heading that already said three. */}
    {ordered.length > PAGE_SIZE && (
      <Pagination
        page={current}
        pageSize={PAGE_SIZE}
        total={ordered.length}
        onPage={setPage}
        noun="theses"
      />
    )}
    </>
  );
}
