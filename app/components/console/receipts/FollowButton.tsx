'use client';

import { useRouter } from 'next/navigation';
import type { Address, Hex } from 'viem';
import { FOLLOW_EVENT, type FollowRequest } from '../../follow';
import { stashHandoff } from '../../handoff';

/**
 * Copy a thesis's basket into the reader's own mandate form.
 *
 * The one client leaf on an otherwise server-rendered page. It navigates, so
 * the receiver is on another route and the DOM event alone would fire into a
 * document that does not contain it — hence the stash as well. See `handoff.ts`.
 *
 * `FollowRequest` carries the assets and nothing else, deliberately (D50). The
 * follower creates the mandate from their own wallet under their own caps, and
 * the size stays theirs: the depth that absorbed the author's notional is not
 * the depth that will absorb a larger one.
 */
export function FollowButton({
  thesisId,
  contentHash,
  basket,
}: {
  thesisId: number;
  contentHash: string;
  basket: { asset: string; symbol: string }[];
}) {
  const router = useRouter();

  const follow: FollowRequest = {
    thesisId,
    contentHash: contentHash as Hex,
    assets: basket.map((b) => b.asset as Address),
    symbols: basket.map((b) => b.symbol),
  };

  return (
    <button
      type="button"
      onClick={() => {
        window.dispatchEvent(new CustomEvent(FOLLOW_EVENT, { detail: follow }));
        stashHandoff({ kind: 'follow', payload: follow });
        router.push('/trade');
      }}
      className="rounded-xl bg-ink px-5 py-3 text-data font-semibold text-ground transition-opacity duration-200 hover:opacity-90"
    >
      Follow this basket
    </button>
  );
}
