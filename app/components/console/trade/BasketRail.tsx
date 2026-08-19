'use client';

import { useEffect, useState } from 'react';
import {
  FILLED_EVENT,
  PICK_ASSET_EVENT,
  QUOTED_EVENT,
  type FilledDetail,
  type PickAssetDetail,
  type QuotedDetail,
} from '../../follow';
import { useFollow } from '../../useFollow';
import { REFUSAL } from '../board-format';

/**
 * Where a followed thesis has got to, one leg at a time.
 *
 * A thesis is a basket and a fill is a single token, because Permit2 scopes a
 * signature to one token and one amount. So a followed basket is executed leg by
 * leg, and until this existed the only sign of that was a one-line banner: the
 * user reselected an asset, requoted, and repeated, with nothing on screen
 * saying how many were left or which had already refused.
 *
 * **It reports only what was measured.** There is no asked-versus-executable
 * headline here, and the omission is deliberate: `FollowRequest` carries the
 * thesis's assets and nothing else, on purpose — the follower sizes the basket
 * themselves, and the depth that absorbed the author's notional is not the depth
 * that will absorb theirs. A total assembled from the author's numbers would be
 * a figure about somebody else's trade printed next to this user's wallet. Legs
 * count up as this user quotes and fills them, and before that they read as what
 * they are, which is unexamined.
 *
 * Refusals carry their reason on the row. `docs/09-design.md` names the
 * alternative as the thing most likely to be got wrong: a column of bare red
 * marks is an alarm, and the reason is what makes it an accounting.
 */
type LegState =
  | { kind: 'pending' }
  | { kind: 'allowed' }
  | { kind: 'refused'; reason?: string }
  | { kind: 'filled' };

export function BasketRail({ direction }: { direction: 'buy' | 'sell' }) {
  const follow = useFollow();
  const [states, setStates] = useState<Record<string, LegState>>({});

  useEffect(() => {
    const onQuoted = (e: Event) => {
      const d = (e as CustomEvent<QuotedDetail>).detail;
      if (!d || d.isExit) return;
      setStates((prev) => ({
        ...prev,
        [d.symbol]: d.allow ? { kind: 'allowed' } : { kind: 'refused', reason: d.reason },
      }));
    };
    const onFilled = (e: Event) => {
      const d = (e as CustomEvent<FilledDetail>).detail;
      // A bare `Event` still reaches here from anything not yet carrying a
      // detail, and an exit is a fill the rail must not tick a leg off for.
      if (!d || d.isExit) return;
      setStates((prev) => ({ ...prev, [d.symbol]: { kind: 'filled' } }));
    };
    window.addEventListener(QUOTED_EVENT, onQuoted);
    window.addEventListener(FILLED_EVENT, onFilled);
    return () => {
      window.removeEventListener(QUOTED_EVENT, onQuoted);
      window.removeEventListener(FILLED_EVENT, onFilled);
    };
  }, []);

  // Cleared when the thesis changes rather than accumulating across follows: a
  // leg ticked off under thesis #4 is not progress through thesis #7.
  useEffect(() => setStates({}), [follow?.thesisId]);

  if (!follow) return null;

  const filled = follow.symbols.filter((s) => states[s]?.kind === 'filled').length;
  const refused = follow.symbols.filter((s) => states[s]?.kind === 'refused');

  return (
    <div className="mb-5">
      <p className="mb-3 rounded-lg border border-signal-deep bg-signal/6 px-3 py-2 text-[12.5px] leading-relaxed text-ink">
        Following thesis <span className="font-mono">#{follow.thesisId}</span>. Each leg is its own
        signature — one token, one amount, twenty minutes — so the basket is filled one at a time.
      </p>

      <ul className="grid gap-1">
        {follow.symbols.map((symbol, i) => {
          const state = states[symbol] ?? { kind: 'pending' };
          const asset = follow.assets[i];
          return (
            <li key={symbol}>
              <button
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent<PickAssetDetail>(PICK_ASSET_EVENT, {
                      detail: { asset, direction },
                    }),
                  )
                }
                className="flex w-full items-baseline justify-between gap-3 rounded-lg border border-line bg-raised px-3 py-2 text-left hover:border-edge"
              >
                <span className="font-mono text-[13px] text-ink">{symbol}</span>
                <LegMark state={state} />
              </button>
            </li>
          );
        })}
      </ul>

      <p className="mt-2 text-right font-mono text-[11.5px] text-faint tabular-nums">
        {filled} of {follow.symbols.length} filled
        {refused.length > 0 && (
          // Grouped and counted rather than listed. Four refusals for one reason
          // is one fact about the market, not four failures.
          <span className="text-caution"> · {refused.length} refused</span>
        )}
      </p>
    </div>
  );
}

function LegMark({ state }: { state: LegState }) {
  if (state.kind === 'filled') {
    return <span className="font-mono text-[11.5px] text-signal">● filled</span>;
  }
  if (state.kind === 'allowed') {
    return <span className="font-mono text-[11.5px] text-signal">● allowed</span>;
  }
  if (state.kind === 'refused') {
    return (
      <span className="text-right font-mono text-[11.5px] text-caution">
        ● refused
        {state.reason && (
          <span className="block text-[11px] font-normal">
            {REFUSAL[state.reason] ?? state.reason}
          </span>
        )}
      </span>
    );
  }
  return <span className="font-mono text-[11.5px] text-faint">○ not quoted</span>;
}
