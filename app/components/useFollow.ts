'use client';

import { useSyncExternalStore } from 'react';
import { followSnapshot, subscribeFollow, type FollowRequest } from './follow';

/**
 * The thesis being followed, for any component that needs to know.
 *
 * `useSyncExternalStore` rather than `useState` plus an effect: the value can
 * already exist before a component mounts — `Mandate` drains the hand-off on
 * mount and publishes it, and the basket rail may mount after that — and this is
 * the hook that reads a store which is already populated without a render pass
 * that shows null first.
 *
 * The server snapshot is `null` because a follow only ever exists in a browser
 * session, and returning the live value would make the markup differ between
 * server and client.
 */
export function useFollow(): FollowRequest | null {
  return useSyncExternalStore(subscribeFollow, followSnapshot, () => null);
}
