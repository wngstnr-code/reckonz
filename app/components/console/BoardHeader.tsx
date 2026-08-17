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
      <div className="flex flex-wrap gap-x-16 gap-y-6">
        <Figure label={`Absorbable at ${(limit / 100).toFixed(2)}%`} value={usd(total)}>
          across the {tradable} with depth
        </Figure>

        <Figure label="Median asset" value={usd(median)}>
          the middle of {board.assets.length - unreadable}
        </Figure>

        {largest && (
          <Figure
            label="Concentration"
            value={`${Math.round(largest.shareOfTotal * 100)}%`}
          >
            {largest.symbol} alone, {usd(largest.usdg)}
          </Figure>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-baseline gap-x-6 gap-y-2 border-t border-line pt-4">
        <p className="text-body text-dim">
          <b className="font-semibold text-ink">{board.assets.length} assets</b> · {tradable}{' '}
          tradable
          {dry > 0 && <> · {dry} with no depth right now</>}
          {unreadable > 0 && <> · {unreadable} we could not read</>}
        </p>

        {blind ? (
          <p className="text-body text-caution">
            No verdict is possible at any size until a price is published.
          </p>
        ) : (
          <p className="text-body text-dim">
            At {usd(sizeUsdg)}: <b className="font-semibold text-signal">{allowed} allowed</b>
            {refused > 0 && (
              <>
                {' '}
                · <span className="text-caution">{refused} refused</span>
                {reasons.length > 0 && <span className="text-faint"> — {reasons.join(', ')}</span>}
              </>
            )}
          </p>
        )}
      </div>

      <p className="mt-3 flex flex-wrap items-center gap-x-2 font-mono text-meta text-faint">
        <span>
          measured {age.label} ·{' '}
          {new Date(board.measuredAt * 1000).toISOString().slice(0, 16).replace('T', ' ')}Z
          {from === 'file' && ' · from the copy that shipped with this deployment'}
        </span>

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
      </p>

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
      <div className="font-mono text-micro text-faint uppercase">{label}</div>
      <div className="mt-1 font-mono text-display font-semibold text-ink">{value}</div>
      <div className="mt-0.5 text-data text-dim">{children}</div>
    </div>
  );
}
