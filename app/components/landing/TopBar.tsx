'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Logo } from '../console/Logo';
import { AppLink } from './AppLink';
import { Menu } from './Menu';

/**
 * The name and the two actions, and nothing else.
 *
 * ## Why it is `fixed` rather than `sticky`
 *
 * A sticky element only sticks for as long as its parent is on screen, so a bar
 * that must survive the whole page has to be a direct child of something that
 * spans the whole page — and then it takes a row of that page's flow, which
 * pushes everything under it down. The claim would no longer be able to sit
 * level with the mark, which is the one thing the layout was drawn around.
 *
 * `fixed` takes no space at all. The bar sits over the page, the claim beside
 * it belongs to the page and scrolls away like the rest of it, and neither has
 * to know about the other.
 *
 * ## Why there is no background across it
 *
 * A full-width bar painted `ground` would be the thing the claim disappears
 * *behind* — and at rest it would be painted over the claim, because a fixed
 * element sits above everything under it. Both problems are the same problem:
 * the bar is not a strip, it is two objects at two edges with an empty middle,
 * and the claim scrolls up through that middle without ever meeting them.
 *
 * So each object carries its own surface instead. The pills already had one.
 *
 * **The mark no longer does.** It was given one to stay readable once the dark
 * wall scrolled up behind it, and the strip below took that job over: the claim
 * sits above the card, so it has always left the window by the time the wall
 * reaches the bar, and the strip is up before the dark ever arrives. A pill
 * that only ever showed as a white rectangle on a white page was left doing
 * nothing but announcing itself against the blur.
 *
 * ## …and why there is one now, further down
 *
 * The objection above was never to a background as such. It was to a
 * background *while the claim is passing through*: the bar would have been the
 * thing the sentence disappeared behind, and at rest it would have been painted
 * over it. Both stop being true the moment the claim has left the window, so
 * that is exactly when the strip arrives.
 *
 * It watches `[data-hero-claim]` rather than a scroll offset. A number would
 * have to be re-derived every time the type size, the top padding or the
 * sentence's own length changed, and it would be wrong on the first viewport
 * that wrapped the claim to four lines instead of three. The element leaving
 * the window is the thing actually being described.
 *
 * The mark's own surface drops to transparent while the strip is up, because
 * two opaque grounds at slightly different opacities meet in a visible seam.
 */
export function TopBar() {
  const [past, setPast] = useState(false);

  useEffect(() => {
    const claim = document.querySelector('[data-hero-claim]');
    if (!claim) return;

    // threshold 0: intersecting is true while any part of the sentence is still
    // in the window, so the strip waits for the last line of it to go.
    const seen = new IntersectionObserver(
      ([entry]) => setPast(!entry.isIntersecting),
      { threshold: 0 },
    );
    seen.observe(claim);
    return () => seen.disconnect();
  }, []);

  return (
    <div
      className={`pointer-events-none fixed inset-x-0 top-0 z-40 flex items-start justify-between gap-x-8 border-b px-[max(2rem,5vw)] pt-10 pb-5 transition-[background-color,border-color,backdrop-filter] duration-300 ease-out ${
        past
          ? 'border-line bg-ground/70 backdrop-blur-xl'
          : 'border-transparent bg-transparent'
      }`}
    >
      <Link href="/" className="pointer-events-auto flex shrink-0 items-center gap-3">
        {/* Mint, as everywhere else the mark appears. The wordmark beside it
            takes the page's ink, so the mark is the only coloured thing in the
            row and stays the thing the eye lands on first. */}
        <Logo className="h-9 w-auto text-signal" />
        <span className="font-logo text-[30px] leading-none font-semibold tracking-[0.02em] text-ink uppercase">
          Reckonz
        </span>
      </Link>

      <div className="pointer-events-auto flex shrink-0 items-center gap-2.5">
        {/* The arrow arrives rather than sitting there.
         *
         * At rest the pill is a label; on approach it becomes a direction. An
         * arrow parked in the button all along says the same thing at every
         * moment and so stops saying anything, and it costs the width of a glyph
         * on the widest row of the page.
         *
         * `overflow-hidden` is what makes it a slide rather than a fade: the
         * arrow starts outside the pill's own edge and is clipped by it, so it
         * enters from off the control instead of materialising inside it.
         *
         * The fill goes to `frame` rather than to `signal`. That is the contrast
         * decision D101 keeps re-teaching: white on `signal` is about 3.4:1 and
         * this label is 13.5px, while `--color-frame` is the green this palette
         * derived specifically to carry white copy — 8.04:1, and the same hue. */}
        <AppLink
          path="/assets"
          className="group relative flex h-11 items-center overflow-hidden rounded-full bg-ink pr-7 pl-7 text-[13.5px] font-semibold tracking-[0.06em] text-ground uppercase transition-colors duration-300 hover:bg-frame"
        >
          <span
            aria-hidden
            className="absolute left-6 -translate-x-5 opacity-0 transition-all duration-300 ease-out group-hover:translate-x-0 group-hover:opacity-100"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
              <path
                d="M2 8h11M9 4l4 4-4 4"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>

          <span className="transition-transform duration-300 ease-out group-hover:translate-x-3.5">
            Launch app
          </span>
        </AppLink>

        <Menu />
      </div>
    </div>
  );
}
