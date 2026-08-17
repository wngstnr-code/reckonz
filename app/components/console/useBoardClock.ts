'use client';

import { useEffect, useState } from 'react';

/**
 * A clock the age label can be trusted against, and a way to ask for a newer board.
 *
 * ## Why the clock exists
 *
 * `freshness()` needs the current time, and reading it during render gives the
 * age at the moment the page was built. A tab left open then reads "5 min ago"
 * an hour later — not stale data, which the page is honest about, but a stale
 * *claim about* the data, which it would not be. On a page whose whole argument
 * is that a capacity figure is a measurement with a date, that is the one label
 * that must not drift.
 *
 * `startAt` is stamped by the server and handed down as a prop, so the first
 * client render uses the same number the HTML was built with and React has
 * nothing to reconcile. Defaulting it to `Date.now()` would read the clock twice
 * — once per environment — and hydrate a different minute than it rendered.
 * Only after mount does it switch to the browser's own clock. Thirty seconds is
 * the interval because the label's smallest unit is a minute; anything finer
 * would re-render for a number that did not change.
 *
 * ## Why the refresh is a button and not a poll
 *
 * The worker measures hourly. A tab polling every few minutes would spend the
 * rate limit in `src/ratelimit.ts` — a per-instance cost ceiling, not a global
 * guarantee — to learn nothing fifty-nine minutes out of sixty. So the page
 * asks when a reader asks, and says plainly when the answer is the same board
 * it already had.
 */
export function useNow(startAt: number) {
  const [now, setNow] = useState(startAt);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    setNow(Date.now());
    return () => clearInterval(id);
  }, []);

  return now;
}

export type RefreshState = 'idle' | 'checking' | 'unchanged' | 'updated' | 'failed';
