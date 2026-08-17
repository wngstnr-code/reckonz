import type { BoardAsset } from '@/src/board';

/**
 * How fast the price runs away from you as the order grows.
 *
 * This is the card's chart, and it is where Ondo puts a 24-hour price
 * sparkline. The substitution is deliberate: a price line is the same line
 * every exchange draws, and the thing nobody else has measured is what happens
 * to that price when *you* are the one buying. A shallow curve is a market that
 * can take size. One that leaves the frame is one that cannot.
 *
 * **It is drawn from the ladder, not from a shape.** Those eight points are the
 * real measurement — `bestQuote` against live pool state at eight sizes — so a
 * card whose curve looks alarming is showing an alarming market rather than a
 * decorative squiggle.
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
}: {
  asset: BoardAsset;
  limitBps?: number;
  className?: string;
}) {
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

  // Evenly spaced by rung rather than by dollars. The sizes span 250 to 50,000,
  // so a linear axis would compress every interesting point into the left edge.
  const x = (i: number) => (i / (asset.ladder.length - 1)) * w;
  const y = (bps: number) => h - Math.min(bps, CEILING_BPS) / CEILING_BPS * h;

  const points = rungs.map((r, i) => `${x(i).toFixed(2)},${y(r.impactBps!).toFixed(2)}`);
  const line = `M${points.join(' L')}`;
  const area = `${line} L${x(rungs.length - 1).toFixed(2)},${h} L0,${h} Z`;
  const limitY = y(limitBps).toFixed(2);

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={className}
      aria-hidden
    >
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
    </svg>
  );
}
