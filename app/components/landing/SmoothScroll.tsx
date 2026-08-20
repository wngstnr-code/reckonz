'use client';

import { useEffect } from 'react';
import Lenis from 'lenis';

/**
 * Smooth scrolling for the landing page, and only for the landing page.
 *
 * ## The weight, and what the number means
 *
 * Lenis eases toward the position the wheel asked for, closing `lerp` of the
 * remaining distance every frame. So the number runs backwards from the feeling:
 * `1` is no smoothing at all and the page lands instantly, and the lower it
 * goes the longer the glide. Lenis ships `0.1`, which is a long, floaty glide.
 *
 * `0.05` is where it landed, after `0.25`, `0.12` and `0.08` were each read as
 * still too light. It is half Lenis's own `0.1` default: the page keeps moving
 * for the better part of a second after the wheel stops, which is as much
 * weight as this can carry and still be a page rather than a slideshow.
 *
 * **This is the floor.** Below it the glide outlasts the intent behind it: a
 * link clicked mid-travel is a link that has moved by the time the click lands,
 * and the page stops answering the wheel and starts negotiating with it. If it
 * needs to feel heavier still, the next lever is `wheelMultiplier` rather than
 * this one — that changes how far a notch of the wheel throws the page, which
 * reads as resistance, where `lerp` reads as momentum. They are different
 * feelings and only one of them costs responsiveness.
 *
 * ## Why it is a component and not a layout
 *
 * The console is a working surface: a trade page that glides away from the
 * pointer is a page that is harder to read a number on. This mounts under `/`
 * alone, so nothing under `app/(console)` inherits it.
 *
 * ## What it must not break
 *
 * `AssetWall` listens for `scroll` on the window to let go of the pointer while
 * the page moves. Lenis drives the real scroll position through `window.scrollTo`
 * rather than transforming a container, so native `scroll` events still fire and
 * that listener still works. It is also why the scrollbar in `globals.css` is a
 * real scrollbar being styled rather than a drawn substitute: the page really
 * does scroll.
 *
 * That bar is no longer this component's business. It was scoped to a class
 * added here, on the argument that the console should keep the scrollbar its
 * operating system gave it; it is on `html` now and both surfaces share it.
 * Only the smoothing is still scoped to `/`.
 */
export function SmoothScroll() {
  useEffect(() => {
    /* This used to also put `landing-scroll` on <html>, which is what the
       scrollbar skin was scoped to. The skin is on `html` in `globals.css` now
       and the console wears it too, so there is nothing to scope and nothing to
       add. What is left here is the smoothing, which is still the landing's
       alone. */
    // Someone who has asked the system for less motion has asked for this too.
    // Skipping the smoothing leaves the browser's own scrolling in place, which
    // is the correct behaviour rather than a degraded one.
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let lenis: Lenis | null = null;
    let frame = 0;

    if (!reduced) {
      lenis = new Lenis({ lerp: 0.05 });
      const instance = lenis;
      frame = requestAnimationFrame(function raf(time) {
        instance.raf(time);
        frame = requestAnimationFrame(raf);
      });
    }

    return () => {
      if (frame) cancelAnimationFrame(frame);
      lenis?.destroy();
    };
  }, []);

  return null;
}
