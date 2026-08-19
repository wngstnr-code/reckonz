'use client';

import { useMemo, useState } from 'react';
import { shortfallMeasured } from '@/src/abi';
import type { ViewReceipt } from '@/src/receipts-view';
import { hasEvidence } from '@/src/receipts-view';
import { ChevronMark, GridMark, RowsMark, SearchMark } from '../marks';
import { Pagination } from '../Pagination';
import { ReceiptCard } from './ReceiptCard';
import { ReceiptsTable } from './ReceiptsTable';
import { notionalOf } from './format';

/**
 * The controls, and the two ways to look at the same receipts.
 *
 * Copied in structure from `BoardView` rather than reinvented: a reader who has
 * used the board already knows this row, and two consoles with two different
 * control bars read as two products.
 *
 * Filtering and sorting live here rather than in either view, so a card and a
 * row can never disagree about what is on screen or in what order.
 */

type View = 'grid' | 'table';
type Filter = 'all' | 'entries' | 'exits' | 'thesis' | 'unmeasured' | 'unaudited';
type Sort = 'recent' | 'oldest' | 'slippage' | 'notional';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'entries', label: 'Entries' },
  { id: 'exits', label: 'Exits' },
  { id: 'thesis', label: 'With a thesis' },
  { id: 'unmeasured', label: 'Unmeasured' },
  { id: 'unaudited', label: 'No evidence' },
];

const SORTS: { id: Sort; label: string }[] = [
  { id: 'recent', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'slippage', label: 'Widest shortfall' },
  { id: 'notional', label: 'Largest first' },
];

/**
 * Sixteen: four rows of four at the widest breakpoint, and a whole screen at
 * every narrower one. Chosen against the grid rather than as a round number, so
 * a page never ends on a row of one.
 */
const PAGE_SIZE = 16;

export function ReceiptsView({ receipts }: { receipts: ViewReceipt[] }) {
  const [view, setView] = useState<View>('grid');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('recent');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const matches = (r: ViewReceipt) => {
      if (needle) {
        const hay = `#${r.id} ${r.fills.map((f) => f.symbol).join(' ')} ${r.evidenceHash}`;
        if (!hay.toLowerCase().includes(needle)) return false;
      }
      if (filter === 'all') return true;
      if (filter === 'entries') return r.fills.some((f) => !f.isExit);
      if (filter === 'exits') return r.fills.some((f) => f.isExit);
      if (filter === 'thesis') return r.thesisId !== null;
      // The two filters that exist to surface a problem rather than a category:
      // without them a reader finds D77's cases only by scrolling twenty cards.
      //
      // Kept apart because they are different failures. A sale nothing priced
      // still has a full record of the decision behind it; a receipt with no
      // evidence hash has none, whatever its shortfall reads as. One chip
      // covering both would have made the label a small lie.
      if (filter === 'unmeasured') return r.fills.some((f) => !shortfallMeasured(f));
      return !hasEvidence(r);
    };

    const worst = (r: ViewReceipt) =>
      r.fills.length ? Math.max(...r.fills.map((f) => f.slippageBps)) : -1;

    return receipts.filter(matches).sort((a, b) => {
      if (sort === 'recent') return b.id - a.id;
      if (sort === 'oldest') return a.id - b.id;
      if (sort === 'slippage') return worst(b) - worst(a);
      return Number(BigInt(notionalOf(b)) - BigInt(notionalOf(a)));
    });
  }, [receipts, filter, query, sort]);

  // Any change to what is being shown puts the reader back at the start of it.
  // Staying on page three of a list that just became one page long renders an
  // empty grid over a filter that matched things.
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const visible = shown.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const change = <T,>(set: (v: T) => void) => (value: T) => {
    set(value);
    setPage(1);
  };

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-3">
        <label className="relative">
          <span className="sr-only">Search receipts</span>
          <SearchMark className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(e) => change(setQuery)(e.target.value)}
            placeholder="Search ticker, receipt or hash"
            spellCheck={false}
            className="w-[19rem] rounded-lg border border-line py-2 pr-3 pl-9 text-data outline-none placeholder:text-faint focus:border-signal-deep"
          />
        </label>

        <div className="flex flex-wrap items-center gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => change(setFilter)(f.id)}
              aria-pressed={filter === f.id}
              className={`rounded-lg px-3 py-2 text-data transition-colors duration-200 ${
                filter === f.id ? 'bg-raised font-semibold text-ink' : 'text-dim hover:text-ink'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center rounded-lg border border-line p-0.5">
            <ViewButton active={view === 'grid'} onClick={() => setView('grid')} label="Card view">
              <GridMark className="h-4 w-4" />
            </ViewButton>
            <ViewButton
              active={view === 'table'}
              onClick={() => setView('table')}
              label="Table view"
            >
              <RowsMark className="h-4 w-4" />
            </ViewButton>
          </div>

          <label className="relative">
            <span className="sr-only">Sort</span>
            <select
              value={sort}
              onChange={(e) => change(setSort)(e.target.value as Sort)}
              className="appearance-none rounded-lg border border-line bg-ground py-2 pr-8 pl-3 text-data text-ink outline-none focus:border-signal-deep"
            >
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <ChevronMark className="pointer-events-none absolute top-1/2 right-3 h-3 w-3 -translate-y-1/2 text-faint" />
          </label>
        </div>
      </div>

      {shown.length === 0 ? (
        // Nothing matching a filter and nothing existing are different facts,
        // and only one of them is about the chain.
        <p className="rounded-xl border border-line bg-panel px-4 py-6 text-data text-dim">
          No receipt matches that. {receipts.length} have settled.
        </p>
      ) : (
        <>
          {view === 'grid' ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {visible.map((r) => (
                <ReceiptCard key={r.id} receipt={r} />
              ))}
            </div>
          ) : (
            <ReceiptsTable receipts={visible} />
          )}

          <Pagination
            page={current}
            pageSize={PAGE_SIZE}
            total={shown.length}
            onPage={setPage}
            noun="receipts"
          />
        </>
      )}
    </>
  );
}

function ViewButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={`rounded-md p-1.5 transition-colors duration-200 ${
        active ? 'bg-raised text-ink' : 'text-faint hover:text-dim'
      }`}
    >
      {children}
    </button>
  );
}
