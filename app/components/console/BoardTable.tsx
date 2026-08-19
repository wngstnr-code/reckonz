import type { BoardAsset } from '@/src/board';
import type { Route } from 'next';
import Link from 'next/link';
import { AssetMark } from './AssetMark';
import { DepthCurve } from './DepthCurve';
import { Tooltip } from './Tooltip';
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
 *
 * ## Why the rows are shorter than they were
 *
 * Every row carried five grey captions and two of them said the same thing on
 * all thirty: `before you lose 0.50%` under each capacity, and the guard's code
 * under each refusal. A caption repeated on every row is a column heading that
 * has been copied thirty times — it costs a line of height per row and tells
 * the reader nothing they did not learn from the first one. The limit is stated
 * once, on the column heading it qualifies and behind a hover so it costs no
 * height at all, and the codes are gone from this surface entirely: the
 * sentence is what a first-time reader can act on, and `/assets/<symbol>` is
 * where the machine-readable reason still lives.
 *
 * The captions that survive vary per row, so each one is a measurement. They
 * sit at `text-fine`, one step under the figure they qualify, so the numbers
 * lead and the column can be skimmed rather than read.
 */

/** The four parts of the gap score, so it reads as measured rather than asserted. */
function GapBar({ parts }: { parts: BoardAsset['gapRiskParts'] }) {
  /* Field names, and what each one means since D62 rewrote the engine: whether
     anyone is quoting this token at all, how far it has historically jumped
     between one session's close and the next open, the width of the band on the
     value, and how far the on-chain price sits from it. */
  const segments = [
    { value: parts.staleness, label: 'not quoting' },
    { value: parts.displacement, label: 'open gap' },
    { value: parts.uncertainty, label: 'band' },
    { value: parts.basis, label: 'basis' },
  ];

  return (
    <span className="mt-1 flex justify-end gap-px" aria-hidden>
      {segments.map((segment) => (
        <span
          key={segment.label}
          title={segment.label}
          className="h-1 w-3 overflow-hidden rounded-[1px] bg-line"
        >
          <span
            className="block h-full bg-caution"
            style={{ width: `${Math.max(0, Math.min(1, segment.value)) * 100}%` }}
          />
        </span>
      ))}
    </span>
  );
}

function Row({ asset, sizeUsdg }: { asset: BoardAsset; sizeUsdg: number }) {
  const verdict = verdictOf(asset, sizeUsdg);
  const tone = TONE[verdict.kind];
  const capacity = asset.capacityUsdg[50];

  return (
    <tr className="border-b border-line/60 last:border-b-0">
      <td className="py-2.5 pr-4 align-top">
        <div className="flex items-center gap-2.5">
          <AssetMark symbol={asset.symbol} size={26} />
          <div>
            {/* The ticker rather than the whole row. A row carries four other
                numbers a reader may want to select and compare, and making all
                of it a link takes that away to save one click. */}
            <Link
              href={`/assets/${asset.symbol}` as Route}
              className="font-mono text-data text-ink underline-offset-3 hover:underline"
            >
              {asset.symbol}
            </Link>
            <div className="text-fine text-faint">{asset.name ?? 'n/a'}</div>
          </div>
        </div>
      </td>

      <td className="py-2.5 pr-4 text-right align-top">
        {/* A withheld value is never a number. Printing the figure the oracle
            refused to publish would undo the refusal, and the page has to be as
            honest as the contract. */}
        {asset.publishable && asset.fairValue !== null ? (
          <>
            <div className="font-mono text-data text-ink">{asset.fairValue.toFixed(2)}</div>
            <div className="text-fine text-faint">give or take {pct(asset.confidenceBps)}</div>
          </>
        ) : (
          <div className="text-data text-caution">no price we can back</div>
        )}
      </td>

      <td className="py-2.5 pr-4 text-right align-top">
        {asset.onchainPrice === null ? (
          <div className="font-mono text-data text-faint">n/a</div>
        ) : (
          <>
            <div className="font-mono text-data text-ink">{asset.onchainPrice.toFixed(2)}</div>
            <div className="text-fine text-faint">
              {asset.basisBps === null ? 'nothing to compare' : `${pct(asset.basisBps)} off fair`}
            </div>
          </>
        )}
      </td>

      <td className="py-2.5 pr-4 text-right align-top">
        <div className="font-mono text-data text-ink">{asset.gapRisk}</div>
        <GapBar parts={asset.gapRiskParts} />
      </td>

      <td className="py-2.5 pr-4 text-right align-top">
        <div className="font-mono text-data text-ink">
          {capacity === null || capacity === undefined ? 'not read' : usd(capacity)}
        </div>
      </td>

      {/* Fixed width so a refusal breaks onto a second line rather than forcing
          the column as wide as its longest sentence. Two short lines of type
          read faster here than one long one, and the table keeps its shape
          whichever verdict is showing. */}
      <td className="w-[7.5rem] py-2.5 pr-4 align-top">
        <div className={`text-data leading-snug ${tone.text}`}>
          {verdict.ok ? 'allowed' : verdict.text}
        </div>
      </td>

      {/* Ondo's last column is a 24-hour price sparkline. Ours is the depth
          curve for the same reason the card carries it instead: a price line is
          the one every exchange draws, and what happens to that price when
          *you* are the buyer is the measurement nobody else took. */}
      <td className="py-2.5 align-top">
        <DepthCurve asset={asset} className={`h-9 w-28 ${tone.curve}`} />
      </td>
    </tr>
  );
}

export function BoardTable({ assets, sizeUsdg }: { assets: BoardAsset[]; sizeUsdg: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[68rem] border-collapse">
        <thead>
          <tr className="border-b border-line align-bottom text-micro text-faint uppercase">
            <th className="pb-2 pr-4 text-left font-semibold">Asset</th>
            <th className="pb-2 pr-4 text-right font-semibold">Value</th>
            <th className="pb-2 pr-4 text-right font-semibold">Price</th>
            {/* Two headings that could not stand alone and could not afford a
                second line either.

                `Gap risk` needs its scale — a bare `18` is unreadable without
                knowing what the top is — and `Capacity` needs its limit, which
                is the harder of the two: absorbable size is not a property of a
                market, it is the answer to "before the price moves how far",
                and the same pool answers $850 at 50bp and roughly ten times
                that at 500bp. Printing the number with the limit left out is
                the shape of mistake D84 records.

                Neither is a fact the reader needs on every glance, so both went
                where the reader can ask for them. `bottom` because this table
                lives in `overflow-x-auto`, which clips a bubble drawn above the
                header row. */}
            <th className="pb-2 pr-4 text-right font-semibold">
              <Tooltip side="bottom" label="A score from 0 to 100 for how far this can jump while you are holding it, out of four measured parts: whether anyone is quoting it, the gap it has historically opened at, the width of the band on its value, and how far the on-chain price sits from that value. The mandate refuses above its own limit.">
                Gap risk
              </Tooltip>
            </th>
            <th className="pb-2 pr-4 text-right font-semibold">
              <Tooltip side="bottom" label={`The most this market can absorb before the price moves ${pct(50)} against you. Walked through real Uniswap V3 liquidity at that limit, not estimated from pool size.`}>
                Capacity
              </Tooltip>
            </th>
            <th className="pb-2 pr-4 text-left font-semibold">Verdict</th>
            <th className="pb-2 text-left font-semibold">Depth</th>
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
