'use client';

import type { BoardAsset } from '@/src/board';
import { DepthCurve } from './DepthCurve';
import type { Route } from 'next';
import Link from 'next/link';
import { AssetMark } from './AssetMark';
import { TONE, pct, usd, verdictOf } from './board-format';

/**
 * One asset, in the shape Ondo uses and with the facts that are ours.
 *
 * The layout is theirs: mark and name on top, a tinted block below carrying a
 * headline number, a supporting line, and a chart filling the rest. What sits
 * in those slots is not.
 *
 * **The headline is capacity, not price.** Price is on every exchange in the
 * world and answers a question this product does not ask; how much this market
 * can actually take before it moves against you is the number nobody else
 * measured, and it is the one a visitor came for.
 *
 * **The chart is the depth curve, not a price sparkline** — see `DepthCurve`.
 *
 * **The tint follows the verdict, not the direction of a price.** Green-for-up
 * would be a fourth meaning for a colour that already has one here, and would
 * make a refusal look like a loss rather than like the product working.
 *
 * **The card itself is the page, held by a stroke.** It was `bg-panel`, which
 * put a grey field behind every card and a second, tinted field inside it —
 * three surfaces deep for one asset, and the tinted block is the only one of
 * them carrying meaning. On the ground colour the stroke does the containing
 * and the tint is the only fill on the card, so the verdict is what the eye
 * finds first. `ReceiptCard` follows this, deliberately: the two grids are the
 * same object in two subjects and a reader should not have to learn both.
 */
export function AssetCard({ asset, sizeUsdg }: { asset: BoardAsset; sizeUsdg: number }) {
  const verdict = verdictOf(asset, sizeUsdg);
  const tone = TONE[verdict.kind];
  const capacity = asset.capacityUsdg[50];

  return (
    <Link
      href={`/assets/${asset.symbol}` as Route}
      className="block rounded-2xl border border-line bg-ground p-4 transition-colors duration-200 hover:border-faint"
    >
      <header className="flex items-center gap-3">
        <AssetMark symbol={asset.symbol} />
        <div className="min-w-0">
          <div className="truncate font-mono text-data font-semibold text-ink">{asset.symbol}</div>
          <div className="truncate text-micro tracking-normal text-faint normal-case">
            {asset.name ?? 'n/a'}
          </div>
        </div>
      </header>

      <div className={`mt-4 rounded-xl p-4 ${tone.tint}`}>
        <div className="font-mono text-title font-semibold text-ink">
          {capacity === null || capacity === undefined ? 'not read' : usd(capacity)}
        </div>
        <div className={`mt-0.5 text-body ${tone.text}`}>
          {verdict.ok ? `allowed at ${usd(sizeUsdg)}` : verdict.text}
        </div>

        <DepthCurve asset={asset} className={`mt-4 h-14 w-full ${tone.curve}`} />

        <div className="mt-2 flex items-baseline justify-between font-mono text-meta text-faint">
          {/* Never the number the oracle refused to publish. */}
          <span>
            {asset.publishable && asset.fairValue !== null
              ? `fair ${asset.fairValue.toFixed(2)}`
              : 'no defensible price'}
          </span>
          <span>gap {asset.gapRisk}</span>
        </div>
      </div>
    </Link>
  );
}


export { pct };
