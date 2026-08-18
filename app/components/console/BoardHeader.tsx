import type { Board } from '@/src/board';
import { REFUSAL, freshness, pricing, usd, verdictOf } from './board-format';
import type { RefreshState } from './useBoardClock';

/**
 * The numbers a reader should carry away, and the ones that stop them being
 * misread.
 *
 * **The total is never alone.** On this board one token is roughly a third of
 * the whole absorbable size, so the sum describes a market almost nobody can
 * reach while the median describes the one most assets are actually in. D84
 * wrote that rule after volume turned out to be 81% two names; depth has the
 * same shape, and printing the total by itself would be the same mistake in a
 * different column.
 *
 * **Refusals are counted and grouped, never left as a wall.** The brief is
 * explicit about why: nine rows of "no depth" reads as a broken app, while
 * "6 refused, all of them too big for this market" reads as an accounting, and
 * only one of those is what a reader should remember.
 *
 * **The date is a judgement, not a timestamp.** See `freshness`.
 */
export function BoardHeader({
  board,
  sizeUsdg,
  from,
  now,
  refresh,
  onRefresh,
}: {
  board: Board;
  sizeUsdg: number;
  from: 'blob' | 'file';
  now: number;
  refresh: RefreshState;
  onRefresh: () => void;
}) {
  const limit = board.mandate.maxImpactBps;
  const total = board.totals.capacityUsdg[limit] ?? 0;
  const median = board.totals.medianUsdg[limit] ?? 0;
  const largest = board.totals.largest;

  const dry = board.totals.dry.length;
  const unreadable = board.totals.unmeasured.length;
  const tradable = board.assets.length - dry - unreadable;

  // Counted from verdicts the board already carries, not decided here.
  const verdicts = board.assets
    .filter((a) => a.depth === 'ok')
    .map((a) => verdictOf(a, sizeUsdg));
  const allowed = verdicts.filter((v) => v.ok).length;

  const byReason = new Map<string, number>();
  for (const v of verdicts) {
    if (v.ok || !v.code) continue;
    byReason.set(v.code, (byReason.get(v.code) ?? 0) + 1);
  }
  const refused = [...byReason.values()].reduce((sum, n) => sum + n, 0);
  const reasons = [...byReason.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([code, n]) => `${n} ${REFUSAL[code] ?? code}`);

  // With no price there is no verdict to summarise, only one cause repeated
  // nineteen times. `PricingNotice` has already said it once, in the sentence
  // that explains it; saying it again as a count would turn one broken feed
  // back into a wall of broken markets.
  const blind = pricing(board).blind;

  const age = freshness(board.measuredAt, now);

  return (
    <section className="mb-8">
      {/* A grid rather than a row of floats, so the three sit on even thirds of
          the page and stay centred in them whatever the numbers are worth.
          Two figures share halves; a board with no tradable asset has no
          largest, and a lone figure stranded at the left would read as a
          layout that broke rather than a fact that is missing. */}
      <div
        className={`grid gap-x-10 gap-y-8 text-center ${
          largest ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
        }`}
      >
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

      {/* Separated by space rather than by an interpunct. A dot between two
          facts reads as one sentence with a stutter in it; a gap reads as two
          facts, which is what these are. */}
      <div className="mt-9 flex flex-wrap items-baseline justify-between gap-x-12 gap-y-3 border-t border-line pt-5">
        <div className="flex flex-wrap items-baseline gap-x-7 gap-y-1.5 text-body text-dim">
          <span className="font-semibold text-ink">{board.assets.length} assets</span>
          <span>{tradable} tradable</span>
          {dry > 0 && <span>{dry} with no depth right now</span>}
          {unreadable > 0 && <span>{unreadable} we could not read</span>}
        </div>

        {blind ? (
          <p className="text-body text-caution">
            No verdict is possible at any size until a price is published.
          </p>
        ) : (
          <div className="flex flex-wrap items-baseline gap-x-7 gap-y-1.5 text-body text-dim">
            <span>At {usd(sizeUsdg)},</span>
            <span className="font-semibold text-signal">{allowed} allowed</span>
            {refused > 0 && <span className="text-caution">{refused} refused</span>}
            {/* Each reason is its own item on the same gap as the counts above
                it, so a refusal and the reason for it are visibly one series
                rather than a clause hanging off a dash. */}
            {reasons.map((reason) => (
              <span key={reason} className="text-faint">
                {reason}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-x-5 gap-y-1.5 font-mono text-[12px] text-faint">
        <span>measured {age.label}</span>
        <span>
          {new Date(board.measuredAt * 1000).toISOString().slice(0, 16).replace('T', ' ')}Z
        </span>
        {from === 'file' && <span>from the copy that shipped with this deployment</span>}

        <button
          type="button"
          onClick={onRefresh}
          disabled={refresh === 'checking'}
          className="text-dim underline underline-offset-3 transition-colors duration-200 hover:text-ink disabled:text-faint"
        >
          {refresh === 'checking' ? 'checking' : 'check for a newer one'}
        </button>

        {/* Each of these is a different fact and only one of them is a problem.
            "Unchanged" is the answer fifty-nine minutes out of sixty, so it is
            said in the same grey as the timestamp rather than as a warning. */}
        {refresh === 'unchanged' && <span>this is the latest measurement</span>}
        {refresh === 'updated' && <span className="text-signal">updated</span>}
        {refresh === 'failed' && <span className="text-caution">could not reach the board</span>}
      </div>

      {age.warning && (
        <p className="mt-2 max-w-[62ch] text-data text-caution">{age.warning}</p>
      )}
    </section>
  );
}

/**
 * One number, big, with the thing that stops it being read alone underneath.
 *
 * The label sits above rather than below, so a reader knows what they are
 * looking at before they read it — which matters when three of these sit in a
 * row and only one of them is a dollar amount.
 */
function Figure({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      {/* Smaller than the line under the number, not equal to it. The label
          names the measurement and the number is the measurement; sizing them
          alike made the page read as three headings rather than three facts. */}
      <div className="font-mono text-[12px] tracking-wide text-faint uppercase">{label}</div>
      <div className="mt-1.5 font-mono text-display font-semibold text-ink">{value}</div>
      <div className="mt-1 text-data text-dim">{children}</div>
    </div>
  );
}
