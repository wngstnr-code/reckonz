import Link from 'next/link';
import type { Route } from 'next';

import { crossOrigin } from '@/app/origins';

/**
 * A link from the landing page into the console.
 *
 * Two shapes, decided by whether the console is actually on another host:
 *
 * - **One origin** (dev, previews, and production until the subdomain is
 *   attached) — an ordinary `<Link>`, prefetched and routed client-side.
 * - **Two origins** — a plain `<a>` to the absolute URL, opening a new tab.
 *
 * It cannot be a `<Link>` in the second case whatever we wanted: the router
 * cannot navigate across hosts, so a `<Link>` there is a full page load
 * wearing a router's clothes.
 *
 * ## The new tab is deliberate
 *
 * By the design owner's call, entering the app leaves the landing page where it
 * was rather than replacing it. That is the uncommon choice — same-tab is the
 * default for moving inside one product — and it is defensible here because
 * across the boundary the two really are different things: the landing page is
 * a document you were reading, the console is a session you connect a wallet
 * to. Coming back from a wallet flow via the back button, to a page that has
 * lost its scroll position and its scroll-driven animations, is the outcome
 * this avoids.
 *
 * `rel="noopener"` is not optional on a `target="_blank"` link, even to our own
 * host: without it the opened document gets a live `window.opener` handle back
 * to this one.
 *
 * Note the asymmetry — nothing points the other way in a new tab. A console
 * that spawned a third tab on the way back would be the same courtesy turned
 * into litter.
 */
export function AppLink({
  path,
  className,
  children,
}: {
  /** A console path, absolute from the root: `/assets`, `/trade`. */
  path: Route;
  className?: string;
  children: React.ReactNode;
}) {
  const external = crossOrigin(path);

  if (!external) {
    return (
      <Link href={path} className={className}>
        {children}
      </Link>
    );
  }

  return (
    <a href={external} target="_blank" rel="noopener" className={className}>
      {children}
    </a>
  );
}
