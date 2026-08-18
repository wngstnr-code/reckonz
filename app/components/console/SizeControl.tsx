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
 * It costs nothing to move: the whole ladder already shipped with the page, so
 * every verdict re-decides in the browser with no request and no recompute.
 *
 * **It carries no label and no readout of its own.** Both were here and both
 * were saying a third time what "At $50,000, 13 allowed" already says two lines
 * above, in the sentence that actually uses the number. A control that repeats
 * its own consequence is not clearer, it is louder. The value stays reachable
 * to a screen reader through `aria-valuetext`, and the current stop is the one
 * marked in the scale.
 */
export function SizeControl({
  board,
  value,
  onChange,
}: {
  board: Board;
  value: number;
  onChange: (usdg: number) => void;
}) {
  const rungs = board.ladderUsdg;
  const index = Math.max(0, rungs.indexOf(value));

  return (
    <section className="mb-8">
      <label htmlFor="size" className="sr-only">
        How much you would put in
      </label>

      <input
        id="size"
        type="range"
        min={0}
        max={rungs.length - 1}
        step={1}
        value={index}
        onChange={(e) => onChange(rungs[Number(e.target.value)])}
        aria-valuetext={`${usd(value)} USDG`}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-raised accent-signal outline-none"
      />

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
    </section>
  );
}
