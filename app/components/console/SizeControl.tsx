'use client';

import type { Board } from '@/src/board';
import { usd } from './board-format';

/**
 * The one control that changes every answer on the page.
 *
 * Capacity is not a property of an asset, it is a property of an asset *and a
 * size*, and a board pinned to one size hides that. At $250 almost everything
 * is allowed and the verdict column says nothing; at $50,000 almost nothing is,
 * and the same board is suddenly an argument. Letting a reader move between
 * those two is the difference between showing numbers and showing the market.
 *
 * **The steps are the rungs the board measured, and nothing between them.**
 * `LADDER_USDG` is walked on chain per asset, so every position of this slider
 * is a real quote against real liquidity. A continuous slider would have to
 * interpolate, and an interpolated verdict is a guess wearing the clothes of a
 * measurement. Eight honest stops beat infinite invented ones.
 *
 * That is also why the rail carries a dot at each stop. A bare rail reads as
 * continuous and invites the reader to believe the positions between the marks
 * mean something; the dots say out loud that there are eight places to be.
 *
 * It costs nothing to move: the whole ladder already shipped with the page, so
 * every verdict re-decides in the browser with no request and no recompute.
 */

/** Matches `.size-range::-webkit-slider-thumb` in `globals.css`. */
const THUMB = 16;
/** The stop marker, small enough to sit under the thumb without ringing it. */
const DOT = 8;

export function SizeControl({
  board,
  value,
  onChange,
  className,
}: {
  board: Board;
  value: number;
  onChange: (usdg: number) => void;
  /** Spacing from whatever this sits under, owned by the caller. The control
      knows how far its own parts stand apart and nothing about the page. */
  className?: string;
}) {
  const rungs = board.ladderUsdg;
  const index = Math.max(0, rungs.indexOf(value));

  return (
    <section className={className}>
      <label htmlFor="size" className="font-mono text-micro text-faint uppercase">
        If you put in
      </label>
      <div className="mt-1 font-mono text-title font-semibold text-ink">{usd(value)}</div>

      {/* Inset rather than flush. A rail that runs into the gutter reads as
          something that overflowed the page rather than something sized to it,
          and the thumb at either end needs room to sit inside its own track. */}
      <div className="mt-5 px-3">
        <div className="relative h-4">
          {/* The rail and its stops, drawn behind the input because a native
              track is opaque and would bury them. See `.size-range`. */}
          <div
            className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-raised"
            aria-hidden
          />

          {/* Inset by half the difference between thumb and dot, so the first
              and last marker sit under the thumb's travel rather than half a
              thumb outside it. */}
          <div
            className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-between"
            style={{ paddingInline: (THUMB - DOT) / 2 }}
            aria-hidden
          >
            {rungs.map((rung) => (
              <span
                key={rung}
                className="rounded-full bg-line"
                style={{ width: DOT, height: DOT }}
              />
            ))}
          </div>

          <input
            id="size"
            type="range"
            min={0}
            max={rungs.length - 1}
            step={1}
            value={index}
            onChange={(e) => onChange(rungs[Number(e.target.value)])}
            aria-valuetext={`${usd(value)} USDG`}
            className="size-range absolute inset-x-0 top-1/2 w-full -translate-y-1/2 cursor-pointer appearance-none bg-transparent outline-none"
          />
        </div>

        <div className="mt-2.5 flex justify-between font-mono text-micro text-faint">
          {rungs.map((rung) => (
            <button
              key={rung}
              type="button"
              onClick={() => onChange(rung)}
              className={`transition-colors duration-200 ${
                rung === value ? 'font-semibold text-ink' : 'hover:text-dim'
              }`}
            >
              {rung >= 1000 ? `${rung / 1000}k` : rung}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
