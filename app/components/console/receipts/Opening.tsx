'use client';

import { useLinkStatus } from 'next/link';

/**
 * The click, acknowledged where the click happened.
 *
 * ## Why the browser's own spinner cannot do this
 *
 * The tab throbber is a document affordance: it turns while the browser is
 * fetching a page. Every move inside this console is a client transition, so
 * the browser never issues a document request and never has anything to spin
 * about. There is no attribute, no config and no trick that changes that, and
 * an app that wants the feedback has to draw it.
 *
 * `loading.tsx` already draws one half of it, and it is the more important
 * half: a skeleton that replaces the page. But it appears *after* the route has
 * begun to swap, and between the pointer going down and that moment there is a
 * gap where the only thing that has happened is a click nobody answered. On a
 * fast connection that gap is invisible. On a cold function it is the whole
 * question the reader is asking, which is whether this row does anything at
 * all.
 *
 * So this fills the gap at the other end: the thing you pressed says it heard
 * you, before the page it leads to has decided anything.
 *
 * ## Shape
 *
 * Always rendered, never mounted on demand, and it changes only `opacity`. The
 * documentation warns that inline indicators cause layout shift, and a spinner
 * that appears into a row would push the row's contents sideways at the exact
 * moment the reader is looking at it. This one occupies its space from the
 * first paint and is simply invisible until it is not.
 *
 * `currentColor`, so it takes the tone of whatever it sits in rather than
 * carrying a colour of its own. It is not a verdict and it must never read as
 * one: `signal` here would say allowed and `caution` would say refused, and
 * what it actually says is "working".
 */
export function Opening({ className = '' }: { className?: string }) {
  const { pending } = useLinkStatus();

  return (
    <span
      aria-hidden
      className={`inline-flex h-3 w-3 shrink-0 transition-opacity duration-150 ${
        pending ? 'opacity-100' : 'opacity-0'
      } ${className}`}
    >
      {/* A ring with a quarter cut out of it, turning. Two `circle`s rather
          than a `border` trick, because a border spinner on a rounded box has
          to be square to stay round and this one is set in `em`-free absolute
          units inside a flex row that may not be. */}
      <svg viewBox="0 0 16 16" className="h-full w-full animate-spin" fill="none">
        <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="2" opacity="0.25" />
        <path
          d="M8 1.5a6.5 6.5 0 0 1 6.5 6.5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
