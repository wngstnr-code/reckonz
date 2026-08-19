import type { Board } from '@/src/board';
import { usd } from './board-format';
import { Figure } from './Figure';

/**
 * The three numbers a reader should carry away, sized for the green frame.
 *
 * They sit here rather than in `BoardHeader` because none of them depends on
 * the slider: absorbable size, the median, and the concentration are facts
 * about the board, not about how much you are bringing. That is what lets them
 * render on the server inside the frame while the counts underneath stay in the
 * client component that owns the size.
 *
 * **The total is never alone.** On this board one token is roughly half the
 * whole absorbable size, so the sum describes a market almost nobody can reach
 * while the median describes the one most assets are actually in. D84 wrote
 * that rule after volume turned out to be 81% two names; depth has the same
 * shape, and printing the total by itself would be the same mistake in a
 * different column.
 */
export function BoardFigures({ board }: { board: Board }) {
  const limit = board.mandate.maxImpactBps;
  const total = board.totals.capacityUsdg[limit] ?? 0;
  const median = board.totals.medianUsdg[limit] ?? 0;
  const largest = board.totals.largest;

  const unreadable = board.totals.unmeasured.length;
  const tradable = board.assets.length - board.totals.dry.length - unreadable;

  return (
    <div className="flex flex-wrap gap-x-11 gap-y-6 sm:flex-nowrap">
      <Figure label={`Absorbable at ${(limit / 100).toFixed(2)}%`} value={usd(total)}>
        across the {tradable} with depth
      </Figure>

      <Figure label="Median asset" value={usd(median)}>
        the middle of {board.assets.length - unreadable}
      </Figure>

      {largest && (
        <Figure label="Concentration" value={`${Math.round(largest.shareOfTotal * 100)}%`}>
          {largest.symbol} alone, {usd(largest.usdg)}
        </Figure>
      )}
    </div>
  );
}
