'use client';

import { useSyncExternalStore } from 'react';

/**
 * Whether this wallet owns a mandate it can execute against.
 *
 * One fact, published by the panel that already reads the chain for it, so that
 * the page can decide *where* the create form belongs without a third serial
 * walk over `nextMandateId` on an RPC that throttles.
 *
 * Three states, not two. `null` is *not yet read* — no wallet, or a walk still
 * in flight; `'unreadable'` is *asked and failed*. Both differ from `0`, and a
 * page that flattened either into "you own nothing" would move a form under a
 * user because the RPC was busy. The one that must never be guessed is the
 * failure: a wallet with three mandates and a throttled read is not a wallet
 * that needs a create form at the top of its page.
 */
export type MandateCount = number | 'unreadable' | null;

let count: MandateCount = null;
const listeners = new Set<() => void>();

export function publishMandateCount(next: MandateCount): void {
  if (next === count) return;
  count = next;
  for (const notify of listeners) notify();
}

export function useMandateCount(): MandateCount {
  return useSyncExternalStore<MandateCount>(
    (notify) => {
      listeners.add(notify);
      return () => listeners.delete(notify);
    },
    () => count,
    () => null,
  );
}
