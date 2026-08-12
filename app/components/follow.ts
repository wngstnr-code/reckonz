import type { Address, Hex } from 'viem';

/**
 * The page's cross-panel events, and the one payload any of them carries.
 *
 * The first is the hand-off from a published thesis to a mandate the follower
 * owns; the other two are "go and look again" after something changed on chain.
 *
 * Follow needs no new contract (D50): the follower calls `createMandate` from
 * their own wallet, so they are `owner`, and `PolicyGuard` bounds them under
 * their own policy rather than the author's. All this carries is which assets
 * to preselect — the size, the caps and the signature stay with the follower.
 *
 * A DOM event rather than shared state or a store: `Theses` and `Mandate` are
 * siblings under a server component, one message travels one way, and a context
 * provider around the page would be more machinery than the message is worth.
 */
export const FOLLOW_EVENT = 'reckonz:follow';

/**
 * Fired when a fill settles, so the thesis panel re-reads the registries and
 * the new receipt appears under the thesis it carried the hash of. That
 * appearance is the loop closing in front of the user, which is worth a reload.
 */
export const FILLED_EVENT = 'reckonz:filled';

/**
 * Fired when a mandate is created, so the fill panel re-reads the chain.
 *
 * Carries no payload: the reader already knows how to enumerate what it can
 * execute against, and a payload would be a second description of a mandate
 * that could disagree with the first.
 */
export const MANDATES_CHANGED_EVENT = 'reckonz:mandates-changed';

export interface FollowRequest {
  thesisId: number;
  /**
   * The thesis's content hash. A fill that carries it lands back in this
   * thesis's track record — which is what closes the loop, and the reason a
   * follower's execution counts as evidence rather than as an untethered trade.
   */
  contentHash: Hex;
  /** The thesis's executed basket, in weight order. */
  assets: Address[];
  symbols: string[];
}
