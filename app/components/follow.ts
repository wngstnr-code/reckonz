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

/**
 * What a settled fill was, rather than merely that one happened.
 *
 * `FILLED_EVENT` used to be a bare `Event`, and every listener only needed to
 * know "go and read the chain again". The basket rail needs more: which leg of a
 * followed thesis just landed. Carried as a `CustomEvent` detail, so the
 * listeners that ignore it keep working unchanged.
 */
export interface FilledDetail {
  symbol: string;
  /** An exit is a fill too, and the rail must not tick a leg off for a sale. */
  isExit: boolean;
}

/**
 * The follow request, held for whoever mounts next.
 *
 * A DOM event reaches the components already listening when it fires, and on
 * `/trade` that is not everyone: `Mandate` drains the `sessionStorage` hand-off
 * on mount, and nothing else sees it. The fill card and the basket rail need the
 * same fact, so it is kept here after it arrives instead of being consumed by
 * whoever happened to be listening.
 *
 * Module scope, not a context provider: one value, three readers, no tree to
 * thread it through.
 */
let current: FollowRequest | null = null;
const listeners = new Set<() => void>();

/** Announce a follow to everything on the page, and remember it for what mounts later. */
export function publishFollow(follow: FollowRequest | null): void {
  current = follow;
  for (const notify of listeners) notify();
  if (follow) {
    // Still fired: the DOM event is the proven path for the panels that share a
    // page with the sender, and dropping it would break them silently.
    window.dispatchEvent(new CustomEvent<FollowRequest>(FOLLOW_EVENT, { detail: follow }));
  }
}

export function followSnapshot(): FollowRequest | null {
  return current;
}

export function subscribeFollow(notify: () => void): () => void {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

/**
 * Fired when a leg has been quoted and the guard has answered, before anything
 * is signed.
 *
 * The basket rail shows where a followed thesis has got to, and "got to" has
 * three states the rail cannot observe on its own: not looked at, looked at and
 * refused, looked at and allowed. Only the card that asked knows, so it says so.
 *
 * The reason travels with the refusal. A rail that renders a bare red mark per
 * leg is the failure mode `docs/09-design.md` names first — twenty-two rows of
 * red is an alarm, and the reason is what turns it into an accounting.
 */
export const QUOTED_EVENT = 'reckonz:quoted';

export interface QuotedDetail {
  symbol: string;
  isExit: boolean;
  allow: boolean;
  /** The guard's code, when it refused. `undefined` on an allow. */
  reason?: string;
}

/**
 * Fired when something outside the trade card names the asset to act on.
 *
 * A row in the positions table, a leg in the basket rail: both are in the left
 * column or above the box, and neither can load a quote itself. They say which
 * asset and in which direction, the card switches tab, and the panel for that
 * direction preselects it.
 *
 * One event for both directions rather than two, because the tab switch and the
 * preselect are the same message read by two different listeners.
 */
export const PICK_ASSET_EVENT = 'reckonz:pick-asset';

export interface PickAssetDetail {
  /** The token to preselect. A plain string; the panels match case-insensitively. */
  asset: string;
  direction: 'buy' | 'sell';
}

/**
 * Fired when something on the page needs the wallet picker that lives in the
 * header.
 *
 * The trade card is where a visitor decides to connect, and the control that can
 * connect them is in the navigation. A second picker in the rail would be a
 * second copy of the same list, free to drift; a button that only *says*
 * "connect wallet" and points at the header is a control that does not do what
 * it says. So the rail's button is real and the header opens.
 */
export const OPEN_WALLET_EVENT = 'reckonz:open-wallet';

/**
 * Fired as the fill amount changes, before anything is quoted.
 *
 * The capacity table is measured on the server and knows every pool's absorbable
 * size; the trade card knows the size being asked for. Neither could answer the
 * only question either of them is really being read for — will *this* trade fit
 * — because the two numbers were never in the same place. This carries one to
 * the other.
 *
 * USDG, and only from the buy side. A sell can be sized in units of the asset,
 * and a table that compared a share count against a dollar capacity would be
 * confidently wrong rather than silent.
 *
 * `null` clears it: no amount, an unparseable one, or the card left on Sell.
 */
export const SIZING_EVENT = 'reckonz:sizing';

export interface SizingDetail {
  usdg: number | null;
}

export function publishSizing(usdg: number | null) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<SizingDetail>(SIZING_EVENT, { detail: { usdg } }));
}
