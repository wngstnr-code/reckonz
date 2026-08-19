'use client';

import { useState } from 'react';
import type { BoardAsset, Rung } from '@/src/board';
import { usd } from './board-format';

/**
 * How fast the price runs away from you as the order grows.
 *
 * This is the card's chart, and it is where Ondo puts a 24-hour price
 * sparkline. The substitution is deliberate: a price line is the same line
 * every exchange draws, and the thing nobody else has measured is what happens
 * to that price when *you* are the one buying. A shallow curve is a market that
 * can take size. One that leaves the frame is one that cannot.
 *
 * **It is drawn from the ladder, not from a shape.** Those points are the
 * real measurement -- `bestQuote` against live pool state at every rung -- so a
 * card whose curve looks alarming is showing an alarming market rather than a
 * decorative squiggle. Nothing here interpolates, smooths, or invents a point:
 * a rung the walk could not quote is dropped rather than drawn.
 *
 * The vertical scale is fixed rather than fitted to each asset. Normalising per
 * card would make every curve fill its box and every market look identical,
 * which is the opposite of the point: at a shared ceiling, thirty cards can be
 * compared at a glance.
 */

/** The top of the frame, matching the widest limit the board measures capacity at. */
const CEILING_BPS = 500;

export function DepthCurve({
  asset,
  limitBps = 50,
  className,
  interactive = false,
}: {
  asset: BoardAsset;
  limitBps?: number;
  className?: string;
  /**
   * Hover reads out the rung under the cursor.
   *
   * Off by default, and deliberately off in the card grid and the table: a
   * 28px-wide sparkline in a thirty-row table has no room for a readout, and a
   * tooltip that fires on every row as the eye scans down is noise. The detail
   * page is where the curve is large enough for a point to be aimed at.
   */
  interactive?: boolean;
}) {
  const [active, setActive] = useState<number | null>(null);

  const rungs = asset.ladder.filter((r) => r.impactBps !== null);

  // Nothing measured, nothing to draw. An empty frame is honest; an
  // interpolated one would be a picture of a market we never quoted.
  if (rungs.length < 2) {
    return (
      <div
        className={`flex items-end justify-start text-micro text-faint normal-case ${className ?? ''}`}
      >
        {asset.depth === 'unreadable' ? 'not measured' : 'nothing to fill'}
      </div>
    );
  }

  const w = 100;
  const h = 40;

  // Evenly spaced by rung rather than by dollars. The sizes span $25 to $50,000,
  // so a linear axis would compress every interesting point into the left edge.
  const x = (i: number) => (i / (asset.ladder.length - 1)) * w;
  const y = (bps: number) => h - (Math.min(bps, CEILING_BPS) / CEILING_BPS) * h;

  const points = rungs.map((r, i) => `${x(i).toFixed(2)},${y(r.impactBps!).toFixed(2)}`);
  const line = `M${points.join(' L')}`;
  const area = `${line} L${x(rungs.length - 1).toFixed(2)},${h} L0,${h} Z`;
  const limitY = y(limitBps).toFixed(2);

  const svg = (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={className} aria-hidden>
      <defs>
        <linearGradient id={`depth-${asset.symbol}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* The mandate's own limit, so the curve is read against something rather
          than admired on its own. Where it crosses is the capacity. */}
      <line
        x1="0"
        y1={limitY}
        x2={w}
        y2={limitY}
        stroke="currentColor"
        strokeOpacity="0.28"
        strokeWidth="0.6"
        strokeDasharray="2 2"
        vectorEffect="non-scaling-stroke"
      />

      <path d={area} fill={`url(#depth-${asset.symbol})`} />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />

      {active !== null && rungs[active] && (
        <>
          <line
            x1={x(active)}
            y1="0"
            x2={x(active)}
            y2={h}
            stroke="currentColor"
            strokeOpacity="0.45"
            strokeWidth="0.8"
            vectorEffect="non-scaling-stroke"
          />
          {/* Drawn as two arcs rather than a circle: `preserveAspectRatio="none"`
              stretches the viewBox, and a circle in that space is an ellipse
              whose shape changes with the container's width. */}
          <path
            d={`M${x(active)},${y(rungs[active].impactBps!)} l0,0`}
            stroke="currentColor"
            strokeWidth="7"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </>
      )}
    </svg>
  );

  if (!interactive) return svg;

  return (
    <div className="relative">
      {svg}

      {/* One target per rung, in HTML rather than SVG, so the hit areas are not
          stretched by the non-uniform viewBox and stay the width the eye sees. */}
      <div className="absolute inset-0 flex" onMouseLeave={() => setActive(null)}>
        {rungs.map((r, i) => (
          <button
            key={r.sizeUsdg}
            type="button"
            className="h-full flex-1 cursor-default"
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
            aria-label={`${usd(r.sizeUsdg)} USDG moves the price ${r.impactBps} bps`}
          />
        ))}
      </div>

      <Readout rung={active === null ? null : (rungs[active] ?? null)} limitBps={limitBps} />
    </div>
  );
}

/**
 * The rung under the cursor, in words.
 *
 * It holds its height when nothing is hovered rather than appearing and
 * disappearing: a readout that pushes the table below it down every time the
 * mouse crosses the chart is worse than one that waits.
 */
function Readout({ rung, limitBps }: { rung: Rung | null; limitBps: number }) {
  if (!rung) {
    return (
      <p className="mt-2.5 text-meta text-faint">
        Hover the curve to read what each size actually costs.
      </p>
    );
  }

  const over = rung.impactBps !== null && rung.impactBps > limitBps;

  return (
    <p className="mt-2.5 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-meta">
      <span className="font-mono tabular-nums text-ink">{usd(rung.sizeUsdg)} USDG</span>
      <span className={`font-mono tabular-nums ${over ? 'text-caution' : 'text-signal'}`}>
        {rung.impactBps} bp
      </span>
      {rung.effectivePrice !== null && (
        <span className="font-mono tabular-nums text-dim">
          at {rung.effectivePrice.toFixed(4)}
        </span>
      )}
      <span className={over ? 'text-caution' : 'text-dim'}>
        {over ? `past the ${limitBps}bp limit` : `inside the ${limitBps}bp limit`}
      </span>
    </p>
  );
}
