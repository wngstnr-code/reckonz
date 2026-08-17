'use client';

import { useMemo, useState } from 'react';
import type { Board, BoardAsset } from '@/src/board';
import { AssetCard } from './AssetCard';
import { BoardTable } from './BoardTable';
import { verdictOf } from './board-format';

/**
 * The controls, and the two ways to look at the same thirty rows.
 *
 * Ondo ships both a card grid and a table behind one toggle, and the reason is
 * the same one that made this a decision rather than a preference: browsing and
 * comparing are different jobs. A card is quicker to take in; a column is the
 * only way to see that one asset absorbs twenty times what the next one does.
 * Cards lead because most arrivals are browsing, and the table is one click
 * away for the moment they are not.
 *
 * Filtering and sorting live here rather than in either view, so a card and a
 * row can never disagree about what is on screen or in what order.
 */

type View = 'grid' | 'table';
type Filter = 'all' | 'tradable' | 'allowed' | 'refused' | 'dry';
type Sort = 'capacity' | 'gap' | 'symbol' | 'value';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All assets' },
  { id: 'tradable', label: 'Tradable' },
  { id: 'allowed', label: 'Allowed' },
  { id: 'refused', label: 'Refused' },
  { id: 'dry', label: 'No depth' },
];

const SORTS: { id: Sort; label: string }[] = [
  { id: 'capacity', label: 'Deepest first' },
  { id: 'gap', label: 'Riskiest first' },
  { id: 'value', label: 'Highest price' },
  { id: 'symbol', label: 'A to Z' },
];

export function BoardView({ board, sizeUsdg }: { board: Board; sizeUsdg: number }) {
  const [view, setView] = useState<View>('grid');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('capacity');
  const [query, setQuery] = useState('');

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const matches = (a: BoardAsset) => {
      if (needle && !`${a.symbol} ${a.name ?? ''}`.toLowerCase().includes(needle)) return false;
      if (filter === 'all') return true;
      const kind = verdictOf(a, sizeUsdg).kind;
      if (filter === 'tradable') return a.depth === 'ok';
      if (filter === 'allowed') return kind === 'allowed';
      if (filter === 'refused') return kind === 'refused';
      return kind === 'dry' || kind === 'unreadable';
    };

    const cap = (a: BoardAsset) => a.capacityUsdg[50] ?? -1;

    return board.assets.filter(matches).sort((a, b) => {
      if (sort === 'capacity') return cap(b) - cap(a);
      if (sort === 'gap') return b.gapRisk - a.gapRisk;
      if (sort === 'value') return (b.fairValue ?? -1) - (a.fairValue ?? -1);
      return a.symbol.localeCompare(b.symbol);
    });
  }, [board.assets, filter, query, sort, sizeUsdg]);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-3">
        <label className="relative">
          <span className="sr-only">Search assets</span>
          <SearchMark className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search asset name or ticker"
            spellCheck={false}
            className="w-[19rem] rounded-lg border border-line py-2 pr-3 pl-9 text-data outline-none placeholder:text-faint focus:border-signal-deep"
          />
        </label>

        <div className="flex flex-wrap items-center gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
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
            <ViewButton active={view === 'table'} onClick={() => setView('table')} label="Table view">
              <RowsMark className="h-4 w-4" />
            </ViewButton>
          </div>

          <label className="relative">
            <span className="sr-only">Sort</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
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
        // Not an empty grid. Nothing matching a filter and nothing existing are
        // different facts, and only one of them is about the market.
        <p className="rounded-xl border border-line bg-panel px-4 py-6 text-data text-dim">
          No asset matches that. {board.assets.length} were measured.
        </p>
      ) : view === 'grid' ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {shown.map((a) => (
            <AssetCard key={a.symbol} asset={a} sizeUsdg={sizeUsdg} />
          ))}
        </div>
      ) : (
        <BoardTable assets={shown} sizeUsdg={sizeUsdg} />
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

function SearchMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.6-3.6" strokeLinecap="round" />
    </svg>
  );
}

function GridMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <rect x="3" y="3" width="8" height="8" rx="2" />
      <rect x="13" y="3" width="8" height="8" rx="2" />
      <rect x="3" y="13" width="8" height="8" rx="2" />
      <rect x="13" y="13" width="8" height="8" rx="2" />
    </svg>
  );
}

function RowsMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <rect x="3" y="4" width="18" height="3" rx="1.5" />
      <rect x="3" y="10.5" width="18" height="3" rx="1.5" />
      <rect x="3" y="17" width="18" height="3" rx="1.5" />
    </svg>
  );
}

function ChevronMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden>
      <path d="m5 8 7 7 7-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
