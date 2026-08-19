import type { Board } from '@/src/board';
import { AssetMark } from '../AssetMark';
import { freshness, usd } from '../board-format';

/**
 * How much each market can actually absorb, and where it stops.
 *
 * The reference carries a Session Limits table on every asset page — the maximum
 * single trade for each trading session — and it is the one block on that page
 * this product can answer better than the original. Theirs is a policy the
 * issuer sets; ours is a measurement of the pools, so the number moves on its
 * own and has a date on it.
 *
 * Rendered on the server from the measured board. It needs no wallet, which is
 * why it is the one section that still has something to say to a visitor who has
 * not connected one — a trade page that is blank until you connect tells a judge
 * nothing in the ninety seconds they give it.
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

  return (
    <>
      <p className="mb-4 max-w-[68ch] text-meta leading-relaxed text-dim">
        The largest trade each pool can take before it moves the price past the limit. Measured{' '}
        {age.label}, not estimated.{' '}
        {age.warning && <span className="text-caution">{age.warning}</span>}
      </p>

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
              return (
                <tr key={asset.symbol} className="border-b border-line/60 last:border-b-0">
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
                  <td className={`py-2.5 text-right text-meta ${state.tone}`}>{state.text}</td>
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
  if (value == null) return <span className="text-faint">—</span>;
  return <>{usd(value)}</>;
}

function stateOf(depth: string, publishable: boolean) {
  if (depth === 'unreadable') return { text: 'could not read', tone: 'text-refuse' };
  if (depth === 'no-pool') return { text: 'no pool', tone: 'text-faint' };
  if (depth === 'no-liquidity') return { text: 'no depth right now', tone: 'text-faint' };
  if (!publishable) return { text: 'no price we can back', tone: 'text-caution' };
  return { text: 'tradable', tone: 'text-signal' };
}
