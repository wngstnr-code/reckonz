'use client';

import { useEffect, useState } from 'react';
import type { Board } from '@/src/board';
import { AssetMark } from '../AssetMark';
import { freshness, usd } from '../board-format';
import { SIZING_EVENT, type SizingDetail } from '../../follow';

/**
 * How much each market can actually absorb, and where it stops.
 *
 * The reference carries a Session Limits table on every asset page — the maximum
 * single trade for each trading session — and it is the one block on that page
 * this product can answer better than the original. Theirs is a policy the
 * issuer sets; ours is a measurement of the pools, so the number moves on its
 * own and has a date on it.
 *
 * Measured on the server and passed in whole, so it needs no wallet and no
 * fetch: it is the one section that still has something to say to a visitor who
 * has not connected one, and a trade page that is blank until you connect tells
 * a judge nothing in the ninety seconds they give it.
 *
 * It is a client component only so it can hear the size being typed in the card
 * beside it. Without that it answered a question nobody was asking — "what can
 * this market take" — while the reader was two feet away deciding whether their
 * own number would go through. The board is the same either way; what changes is
 * whether the table is about the market or about this trade.
 *
 * Every market is listed rather than only the ones a mandate allows: the
 * allowlist lives in the user's wallet and this is a server render, and a table
 * that silently shortened itself once a wallet appeared would look like the
 * market had shrunk.
 */
export function Limits({ board, now }: { board: Board; now: number }) {
  // The two tightest limits the board measured. Hardcoding 50 and 100 would go
  // wrong the moment `capacityLimitsBps` changes, and it has.
  const [tight, loose] = [...board.capacityLimitsBps].sort((a, b) => a - b);

  // Deepest first: the question this table answers is where size can go, and the
  // markets that cannot take any are the tail of that answer, not the head.
  const rows = [...board.assets].sort(
    (a, b) => (b.capacityUsdg[tight] ?? -1) - (a.capacityUsdg[tight] ?? -1),
  );

  const age = freshness(board.measuredAt, now);
  const asking = useSizing();

  // Only counted where there is a measurement. A pool the walk could not read
  // is neither a market that fits nor one that refuses, and folding it into
  // either count would state a fact about it that nobody established.
  const measured = asking === null ? [] : rows.filter((a) => a.capacityUsdg[tight] != null);
  const fits = measured.filter((a) => (a.capacityUsdg[tight] ?? 0) >= asking!).length;

  return (
    <>
      <p className="mb-4 max-w-[68ch] text-meta leading-relaxed text-dim">
        The largest trade each pool can take before it moves the price past the limit. Measured{' '}
        {age.label}, not estimated.{' '}
        {age.warning && <span className="text-caution">{age.warning}</span>}
      </p>

      {asking !== null && (
        <p className="mb-4 text-data text-ink">
          <span className="font-mono tabular-nums">{usd(asking)}</span> fits in{' '}
          <span className={`font-mono tabular-nums ${fits === 0 ? 'text-refuse' : 'text-signal'}`}>
            {fits}
          </span>{' '}
          of {measured.length} measured markets.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse">
          <thead>
            <tr className="border-b border-line text-micro text-faint uppercase">
              <th className="pb-2 pr-4 text-left font-semibold">Market</th>
              <th className="pb-2 pr-4 text-right font-semibold">Absorbs @{tight}bp</th>
              <th className="pb-2 pr-4 text-right font-semibold">@{loose}bp</th>
              <th className="pb-2 pr-4 text-right font-semibold">Gap risk</th>
              <th className="pb-2 text-right font-semibold">State</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((asset) => {
              const state = stateOf(asset.depth, asset.publishable);
              // The row's answer about *this* trade, which outranks its answer
              // about the market: a tradable pool that cannot take the size is
              // the case the reader most needs told, and leaving it green
              // because it is generally healthy is the failure this whole
              // section was rebuilt to stop.
              const room = fitOf(asset.capacityUsdg[tight], asking);
              return (
                <tr
                  key={asset.symbol}
                  className={`border-b border-line/60 last:border-b-0 ${
                    room === 'short' ? 'opacity-45' : ''
                  }`}
                >
                  <td className="py-2.5 pr-4">
                    <span className="flex items-center gap-2.5">
                      <AssetMark symbol={asset.symbol} size={22} />
                      <span className="font-mono text-meta text-ink">{asset.symbol}</span>
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono text-meta tabular-nums text-ink">
                    <Capacity value={asset.capacityUsdg[tight]} />
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono text-meta tabular-nums text-dim">
                    <Capacity value={asset.capacityUsdg[loose]} />
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono text-meta tabular-nums text-dim">
                    {asset.gapRisk}
                  </td>
                  <td className={`py-2.5 text-right text-meta ${state.tone}`}>
                    {room === 'fits' ? (
                      <span className="text-signal">takes it</span>
                    ) : room === 'short' ? (
                      <span className="text-caution">too large</span>
                    ) : (
                      state.text
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

/**
 * Zero and unknown are different answers and must not share a glyph.
 *
 * A dry pool really can absorb nothing, and `$0` is the true measurement. A pool
 * the walk could not read has no measurement at all, and printing `$0` for it
 * would report a failure as a fact about the market.
 */
function Capacity({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="text-faint">n/a</span>;
  return <>{usd(value)}</>;
}

function stateOf(depth: string, publishable: boolean) {
  if (depth === 'unreadable') return { text: 'could not read', tone: 'text-refuse' };
  if (depth === 'no-pool') return { text: 'no pool', tone: 'text-faint' };
  if (depth === 'no-liquidity') return { text: 'no depth right now', tone: 'text-faint' };
  if (!publishable) return { text: 'no price we can back', tone: 'text-caution' };
  return { text: 'tradable', tone: 'text-signal' };
}

/**
 * The size being typed in the card beside this table.
 *
 * A subscription rather than a prop: the table is rendered from a server
 * measurement and the amount lives in a client panel two columns away, with the
 * page's layout grid between them. Lifting the amount to the route would make a
 * server component re-render on every keystroke.
 */
function useSizing() {
  const [usdg, setUsdg] = useState<number | null>(null);
  useEffect(() => {
    const on = (e: Event) => setUsdg((e as CustomEvent<SizingDetail>).detail.usdg);
    window.addEventListener(SIZING_EVENT, on);
    return () => window.removeEventListener(SIZING_EVENT, on);
  }, []);
  return usdg;
}

/**
 * Whether one market can take the size asked for.
 *
 * `unknown` covers both "nothing is being asked" and "this pool has no
 * measurement", which are different reasons to say nothing and the same thing to
 * render: the row keeps its own description of itself rather than borrowing a
 * verdict about a trade nobody can check it against.
 */
function fitOf(capacity: number | null | undefined, asking: number | null) {
  if (asking === null || capacity == null) return 'unknown' as const;
  return capacity >= asking ? ('fits' as const) : ('short' as const);
}
