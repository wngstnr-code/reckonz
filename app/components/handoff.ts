import type { FollowRequest, TriggerInstallRequest } from './follow';

/**
 * The two hand-offs that have to survive a page change.
 *
 * `follow.ts` sends its messages as DOM events, which was exactly right when
 * every panel lived on one page: sender and receiver were siblings and the
 * message travelled one way. Splitting the console into `/idea`, `/receipts`
 * and `/trade` broke two of them, because the receiver is now on a different
 * page and an event fired into a document that does not contain it is a button
 * that does nothing.
 *
 * So those two are also written here before navigating, and the mandate form
 * drains this on mount. The events are left in place rather than replaced: they
 * still work when sender and receiver do share a page, and they are the proven
 * path.
 *
 * `sessionStorage`, not `localStorage`: this is a message in flight between two
 * clicks, and it should die with the tab rather than resurface next week. One
 * slot, because a user can only be acting on one hand-off at a time and a queue
 * would just be a way for the wrong one to arrive.
 */

const KEY = 'reckonz:handoff';

export type Handoff =
  | { kind: 'follow'; payload: FollowRequest }
  | { kind: 'triggers'; payload: TriggerInstallRequest };

export function stashHandoff(handoff: Handoff): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(handoff));
  } catch {
    // Private mode, a full quota, a browser that refuses. The click still
    // navigates; the form simply opens empty, which is recoverable by hand.
  }
}

/** Reads and clears in one go: a hand-off that replays on the next visit would
 *  quietly refill a form the user had deliberately cleared. */
export function takeHandoff(): Handoff | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    const parsed = JSON.parse(raw) as Handoff;
    return parsed.kind === 'follow' || parsed.kind === 'triggers' ? parsed : null;
  } catch {
    return null;
  }
}
