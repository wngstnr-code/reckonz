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

/**
 * The gap score against the bound it is judged by.
 *
 * It used to be the four components of the score, each its own 12px trough. At
 * that size a component of 0.04 is a fill under half a pixel, so what the
 * column actually rendered was four grey dashes with the occasional speck in
 * them — a breakdown nobody could read, which is worse than no breakdown at
 * all because it still costs the row a line of height.
 *
 * The breakdown was not wrong to want, it was in the wrong place. It lives on
 * `/assets/<symbol>`, at a size where each part has a label and a bar you can
 * compare against the others. What belongs here is the one question a reader
 * has while skimming thirty rows: is this number large?
 *
 * **A bare `19` cannot answer that, and neither can a bar with no mark on it.**
 * The scale is 0 to 100 and the guard refuses above `maxGapRisk`, so the tick
 * is drawn at that bound and the fill is read against it. A row well short of
 * the tick is a market the guard has no argument with; a row past it is a
 * refusal you can see coming before you read the verdict column.
 *
 * The limit is threaded from the board rather than imported, so it is the same
 * number the verdicts in the last column were decided against. A tick from a
 * different mandate would be a line drawn where nothing happens.
 */
function GapBar({ score, limit }: { score: number; limit: number }) {
  const fill = Math.max(0, Math.min(100, score));
  const mark = Math.max(0, Math.min(100, limit));
  const over = score > limit;

  return (
    <span className="relative mt-1.5 ml-auto block h-[3px] w-16 rounded-full bg-line" aria-hidden>
      <span
        className={`block h-full rounded-full ${over ? 'bg-refuse' : 'bg-caution'}`}
        style={{ width: `${fill}%` }}
      />
      {/* Taller than the track it crosses, so it reads as a threshold on the
          scale rather than as a gap in the fill. */}
      <span
        className="absolute -top-[3px] -bottom-[3px] w-px bg-dim"
        style={{ left: `${mark}%` }}
      />
    </span>
  );
}

function Row({
  asset,
  sizeUsdg,
  gapRiskLimit,
}: {
  asset: BoardAsset;
  sizeUsdg: number;
  gapRiskLimit: number;
}) {
  const verdict = verdictOf(asset, sizeUsdg);
  const tone = TONE[verdict.kind];
  const capacity = asset.capacityUsdg[50];

  return (
    <tr className="group relative border-b border-line/60 transition-colors last:border-b-0 hover:bg-panel">
      <td className="py-2.5 pr-4 align-top">
        <div className="flex items-center gap-2.5">
          <AssetMark symbol={asset.symbol} size={26} />
          <div>
            {/* One link, stretched over the row.
             *
             * This used to be the ticker alone, and the note here argued that a
             * row carrying five numbers should stay selectable rather than
             * become one target. The row won: a table of thirty rows where only
             * a six-character word is clickable makes the reader aim, and
             * aiming is a worse tax than losing drag-select on a figure that is
             * one click away in full on the page this leads to.
             *
             * The `::after` covers the row rather than the cell, which needs
             * the `tr` to be the positioned ancestor — hence `relative` on it
             * above. It stays a real anchor, so it keyboard-focuses, opens in a
             * new tab on the modifier click, and reads as one link to a screen
             * reader rather than six. */}
            <Link
              href={`/assets/${asset.symbol}` as Route}
              className="font-mono text-data text-ink underline-offset-3 after:absolute after:inset-0 after:content-[''] group-hover:underline"
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
        <GapBar score={asset.gapRisk} limit={gapRiskLimit} />
      </td>

      <td className="py-2.5 pr-4 text-right align-top">
        <div className="font-mono text-data text-ink">
          {capacity === null || capacity === undefined ? 'not read' : usd(capacity)}
        </div>
      </td>

      {/* Fixed width, and the width is set by the longest sentence that can
          appear here.
          
          It was 7.5rem, which broke `too big for this market` into two lines
          and `price here is too far from fair` into three. Two lines is a
          shape; three is a paragraph in a table cell, and it pushes the row
          taller than every other row on the board. The sentences are not
          negotiable — they are what a first-time reader can act on, and
          shortening them to fit a column would trade meaning for tidiness.
          
          So the column fits the worst case instead: `too risky while the
          market is shut`, 34 characters, in two lines. Everything shorter than
          that has room to spare. */}
      <td className="w-[10.5rem] py-2.5 pr-4 align-top">
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

export function BoardTable({
  assets,
  sizeUsdg,
  gapRiskLimit,
}: {
  assets: BoardAsset[];
  sizeUsdg: number;
  /** `board.mandate.maxGapRisk`: the bound these verdicts were decided against. */
  gapRiskLimit: number;
}) {
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
            <Row key={a.symbol} asset={a} sizeUsdg={sizeUsdg} gapRiskLimit={gapRiskLimit} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
