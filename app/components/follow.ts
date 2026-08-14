import type { Address, Hex } from 'viem';
import type { ResolvedTrigger } from '@/src/thesis';

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

/**
 * Fired when a run's compiled exit rules are handed to the mandate form (D76).
 *
 * Until this existed, `encodeTriggers` — the join between a compiled thesis and
 * `PolicyGuard.setTriggers` — had no caller at all: the rules were rendered in
 * the triggers panel and then the user retyped them by hand, if they installed
 * them at all. "The same compilation produces the entry and the risk rules" was
 * true of the pipeline and false of anything that wrote to the chain.
 *
 * Same shape of message as Follow, and for the same reason: two siblings under a
 * server component, one message, one direction. It carries the compiled rules
 * rather than encoded ones because the mandate's allowlist is not known until
 * the user picks it — `encodeTriggers` runs in the form, against what is
 * actually being allowed, and drops what falls outside it.
 */
export const INSTALL_TRIGGERS_EVENT = 'reckonz:install-triggers';

export interface TriggerInstallRequest {
  /** `CompiledMandate.exitTriggers`, straight from the run. */
  exitTriggers: ResolvedTrigger[];
  /** What no metric could capture, carried so the form can repeat the warning. */
  manualWatch: string[];
}

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
