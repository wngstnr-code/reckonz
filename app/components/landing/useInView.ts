'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Is this element on screen right now.
 *
 * **Now, not ever.** The observer is deliberately never disconnected: these
 * animations are tied to the scroll, so scrolling back up has to take them
 * apart again — the heading drops into its mask, the stroke undraws, the frame
 * shrinks away. An observer that fires once and quits would leave a section
 * that can only ever be seen arriving.
 *
 * That costs nothing to hold: one entry, and the browser is watching the
 * geometry it already computes.
 *
 * `rootMargin` pulls the trigger line up from the bottom edge, so a block does
 * not begin its entrance while only its first pixel is on screen — by the time
 * the animation is worth watching, the thing is properly in view.
 */
export function useInView<T extends HTMLElement>(margin = '-15% 0px') {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // No observer, or a reader who has asked for less motion: show the finished
    // state rather than the starting one. Nothing here is content that only
    // exists after an animation, so skipping it costs nothing.
    if (
      typeof IntersectionObserver === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setSeen(true);
      return;
    }

    const observer = new IntersectionObserver(([entry]) => setSeen(entry.isIntersecting), {
      rootMargin: margin,
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, [margin]);

  return { ref, seen };
}
