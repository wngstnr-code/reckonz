import type { BoardAsset } from '@/src/board';
import { AssetMark } from './AssetMark';
import { TONE, pct, usd, verdictOf } from './board-format';

/**
 * The same assets, read down a column.
 *
 * This is the view that earns the product its argument. A card says wTSLAx can
 * take $20,912; only a column says it takes twenty times what the asset under
 * it does, and that one token is a third of the whole board. That comparison is
 * the reason the table exists beside the grid rather than instead of it.
 *
 * It renders what it is handed, in the order it is handed. Filtering and
 * sorting belong to `BoardView` so the two views cannot disagree about either.
 */

/** The four parts of the gap score, so it reads as measured rather than asserted. */
function GapBar({ parts }: { parts: BoardAsset['gapRiskParts'] }) {
  const segments = [parts.staleness, parts.displacement, parts.uncertainty, parts.basis];
  return (
    <span className="mt-1 flex justify-end gap-px" aria-hidden>
      {segments.map((value, i) => (
        <span key={i} className="h-1 w-3 overflow-hidden rounded-[1px] bg-line">
          <span
            className="block h-full bg-caution"
            style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
          />
        </span>
      ))}
    </span>
  );
}

function Row({ asset, sizeUsdg }: { asset: BoardAsset; sizeUsdg: number }) {
  const verdict = verdictOf(asset, sizeUsdg);
  const capacity = asset.capacityUsdg[50];

  return (
    <tr className="border-b border-line/60 last:border-b-0">
      <td className="py-3 pr-4 align-top">
        <div className="flex items-center gap-2.5">
          <AssetMark symbol={asset.symbol} size={26} />
          <div>
            <div className="font-mono text-data text-ink">{asset.symbol}</div>
            <div className="text-micro tracking-normal text-faint normal-case">
              {asset.name ?? '—'}
            </div>
          </div>
        </div>
      </td>

      <td className="py-3 pr-4 text-right align-top">
        {/* A withheld value is never a number. Printing the figure the oracle
            refused to publish would undo the refusal, and the page has to be as
            honest as the contract. */}
        {asset.publishable && asset.fairValue !== null ? (
          <>
            <div className="font-mono text-data text-ink">{asset.fairValue.toFixed(2)}</div>
            <div className="text-micro tracking-normal text-faint normal-case">
              give or take {pct(asset.confidenceBps)}
            </div>
          </>
        ) : (
          <div className="text-data text-caution">no price we can back</div>
        )}
      </td>

      <td className="py-3 pr-4 text-right align-top">
        {asset.onchainPrice === null ? (
          <div className="font-mono text-data text-faint">—</div>
        ) : (
          <>
            <div className="font-mono text-data text-ink">{asset.onchainPrice.toFixed(2)}</div>
            <div className="text-micro tracking-normal text-faint normal-case">
              {asset.basisBps === null ? 'nothing to compare' : `${pct(asset.basisBps)} off fair`}
            </div>
          </>
        )}
      </td>

      <td className="py-3 pr-4 text-right align-top">
        <div className="font-mono text-data text-ink">{asset.gapRisk}</div>
        <GapBar parts={asset.gapRiskParts} />
      </td>

      <td className="py-3 pr-4 text-right align-top">
        <div className="font-mono text-data text-ink">
          {capacity === null || capacity === undefined ? 'not read' : usd(capacity)}
        </div>
        <div className="text-micro tracking-normal text-faint normal-case">
          before you lose {pct(50)}
        </div>
      </td>

      <td className="py-3 align-top">
        <div className={`text-data ${TONE[verdict.kind].text}`}>{verdict.text}</div>
        {verdict.code && <div className="font-mono text-micro text-faint">{verdict.code}</div>}
      </td>
    </tr>
  );
}

export function BoardTable({ assets, sizeUsdg }: { assets: BoardAsset[]; sizeUsdg: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[60rem] border-collapse">
        <thead>
          <tr className="border-b border-line text-micro text-faint uppercase">
            <th className="pb-2 pr-4 text-left font-semibold">Asset</th>
            <th className="pb-2 pr-4 text-right font-semibold">Value</th>
            <th className="pb-2 pr-4 text-right font-semibold">Price</th>
            <th className="pb-2 pr-4 text-right font-semibold">Gap</th>
            <th className="pb-2 pr-4 text-right font-semibold">Capacity</th>
            <th className="pb-2 text-left font-semibold">Verdict</th>
          </tr>
        </thead>
        <tbody>
          {assets.map((a) => (
            <Row key={a.symbol} asset={a} sizeUsdg={sizeUsdg} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
