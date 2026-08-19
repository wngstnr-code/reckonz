import Link from 'next/link';
import type { Route } from 'next';
import { shortfallMeasured } from '@/src/abi';
import type { ViewReceipt } from '@/src/receipts-view';
import { hasEvidence } from '@/src/receipts-view';
import { AssetMark } from '../AssetMark';
import { direction, e8, notionalOf, short, usdg, when } from './format';

/**
 * The same twenty receipts as columns.
 *
 * `BoardView` ships both a grid and a table for a reason that holds here
 * unchanged: browsing and comparing are different jobs, and a column is the
 * only way to see that one fill slipped thirty times what the next one did.
 *
 * One row per receipt, not per fill. A receipt is what the chain signs and what
 * the evidence hash binds; splitting it into legs would put the same hash on
 * several rows and invite the reader to count it twice.
 */
export function ReceiptsTable({ receipts }: { receipts: ViewReceipt[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[52rem] border-collapse">
        <thead>
          <tr className="border-b border-line text-micro text-faint uppercase">
            <th className="pb-2 pr-4 text-left font-semibold">Receipt</th>
            <th className="pb-2 pr-4 text-left font-semibold">Asset</th>
            <th className="pb-2 pr-4 text-right font-semibold">Notional</th>
            <th className="pb-2 pr-4 text-right font-semibold">At</th>
            <th className="pb-2 pr-4 text-right font-semibold">Shortfall</th>
            <th className="pb-2 pr-4 text-right font-semibold">Gap</th>
            <th className="pb-2 pr-4 text-left font-semibold">Thesis</th>
            <th className="pb-2 text-left font-semibold">Evidence</th>
          </tr>
        </thead>
        <tbody>
          {receipts.map((r) => {
            const first = r.fills[0];
            const many = r.fills.length > 1;
            const measured = r.fills.every(shortfallMeasured);
            const worst = r.fills.length ? Math.max(...r.fills.map((f) => f.slippageBps)) : 0;

            return (
              <tr key={r.id} className="border-b border-line/60 last:border-b-0">
                <td className="py-2.5 pr-4">
                  <Link
                    href={`/receipts/${r.id}` as Route}
                    className="font-mono text-meta text-ink hover:text-signal"
                  >
                    #{r.id}
                  </Link>
                  <div className="font-mono text-micro tracking-normal text-faint normal-case">
                    {when(r.timestamp)}
                  </div>
                </td>
                <td className="py-2.5 pr-4">
                  <span className="flex items-center gap-2.5">
                    {first && <AssetMark symbol={first.symbol} size={22} />}
                    <span className="min-w-0">
                      <span className="block font-mono text-meta text-ink">
                        {many ? `${r.fills.length} assets` : (first?.symbol ?? 'n/a')}
                      </span>
                      <span className="block font-mono text-micro tracking-normal text-faint normal-case">
                        {direction(r.fills)}
                      </span>
                    </span>
                  </span>
                </td>
                <td className="py-2.5 pr-4 text-right font-mono text-meta tabular-nums text-ink">
                  {usdg(notionalOf(r))}
                </td>
                <td className="py-2.5 pr-4 text-right font-mono text-meta tabular-nums text-dim">
                  {many || !first ? 'n/a' : e8(first.executionPriceE8)}
                </td>
                {/* Zero and unmeasured are different answers and must not share
                    a glyph. The slippage field really is `0` on a fill nothing
                    priced, and printing it would report the best possible
                    number for the worst possible reason (D77). */}
                <td className="py-2.5 pr-4 text-right font-mono text-meta tabular-nums">
                  {measured ? (
                    <span className={worst > 50 ? 'text-caution' : 'text-ink'}>{worst} bp</span>
                  ) : (
                    <span className="text-caution">unmeasured</span>
                  )}
                </td>
                <td className="py-2.5 pr-4 text-right font-mono text-meta tabular-nums text-dim">
                  {first?.gapRisk ?? 'n/a'}
                </td>
                <td className="py-2.5 pr-4 font-mono text-meta text-dim">
                  {r.thesisId === null ? <span className="text-faint">n/a</span> : `#${r.thesisId}`}
                </td>
                <td className="py-2.5 font-mono text-meta">
                  {hasEvidence(r) ? (
                    <span className="text-dim" title={r.evidenceHash}>
                      {short(r.evidenceHash)}
                    </span>
                  ) : (
                    <span className="text-refuse">none</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
