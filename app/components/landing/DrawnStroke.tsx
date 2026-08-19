'use client';

import { useEffect, useRef } from 'react';

/**
 * A line drawn by hand, drawn again by the scroll.
 *
 * There are two of these on the page and they were one implementation each
 * until the second one arrived. What they share is not a shape — the shapes are
 * the whole point and neither is reusable — but a method: capture a mouse
 * stroke verbatim, normalise nothing, and put the pen exactly as far along the
 * path as the reader is down the page.
 *
 * ## Not a transition
 *
 * `--draw` is written from the scroll position every frame, and the dash offset
 * is that fraction of the path's own length. So the line is a readout rather
 * than an animation: scrolling back takes it apart at the same rate, because it
 * was never an event.
 *
 * ## Three things are measured, none of them declared
 *
 * **The length.** `stroke-dasharray` needs one dash exactly as long as the
 * path. It was written as `pathLength="1"` with a dash of `1`, which is the
 * tidy form and did not survive contact with `vector-effect: non-scaling-stroke`
 * — that resolves the dash against the *rendered* line while `pathLength`
 * normalises against the *user-unit* one, so the pattern stopped being one path
 * long and the stroke came in as dashes rather than as a line arriving. Both
 * are gone; the length is read off the element in the units the dash is written
 * in.
 *
 * **Where the pen lands.** `getPointAtLength(0)` is the stroke's first contact,
 * and the viewBox says how far down the box that is. Reading it from the
 * section's top edge instead meant a line that starts a quarter of the way down
 * its own box was already a fifth drawn before the reader could see any of it —
 * the pen appeared to have been at work off-screen.
 *
 * **How far it has to go.** `getBBox()` gives the ink's own extent, so the
 * travel is the height of the drawing rather than a constant. That is the
 * difference between the two strokes on this page: one is half a screen tall
 * and the other is nearly three, and a shared constant would have finished the
 * tall one before the reader had scrolled past its middle.
 *
 * All three are read once. They are properties of the `d`, and the `d` does not
 * move.
 *
 * ## The weight scales with the drawing
 *
 * No `non-scaling-stroke`. The weight is the one the line was drawn at, in the
 * units it was drawn in, so it stays the same fraction of the page however wide
 * the page is — which is the relationship the artist was looking at. Pinned to
 * screen pixels it was a fixed weight over a curve that scales, and matched the
 * drawing at exactly one width.
 */
export function DrawnStroke({
  d,
  viewBox,
  weight = 45,
  className,
}: {
  /** The `d`, in the coordinates it was drawn in. Do not tidy the numbers. */
  d: string;
  /** The sheet it was drawn on, not the box its ink happens to fill. */
  viewBox: string;
  weight?: number;
  className: string;
}) {
  const path = useRef<SVGPathElement | null>(null);

  useEffect(() => {
    const node = path.current;
    const svg = node?.ownerSVGElement;
    if (!node || !svg) return;

    node.style.setProperty('--len', String(node.getTotalLength()));

    // A reader who has asked for less motion gets the finished line. `--draw`
    // has to be said out loud: its default is 0, which is not "undrawn by
    // preference" but "invisible".
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      node.style.setProperty('--draw', '1');
      return;
    }

    const box = svg.viewBox.baseVal;
    const ink = node.getBBox();
    const head = box.height ? node.getPointAtLength(0).y / box.height : 0;
    const tail = box.height ? (ink.y + ink.height) / box.height : 1;

    let ticking = 0;

    const measure = () => {
      ticking = 0;

      const H = window.innerHeight;
      const rect = svg.getBoundingClientRect();

      /* Zero when the pen's first contact is at the bottom of the screen, so
         the reader watches it touch down. One when the last of the ink has
         climbed to the upper half — the line finishes while its own end is
         still comfortably in view, rather than completing off-screen. */
      const pen = rect.top + rect.height * head;
      const travel = (tail - head) * rect.height + H * 0.55;
      const drawn = Math.max(0, Math.min(1, (H - pen) / travel));

      node.style.setProperty('--draw', drawn.toFixed(4));
    };

    const onScroll = () => {
      if (!ticking) ticking = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(ticking);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [d, viewBox]);

  return (
    <svg viewBox={viewBox} aria-hidden className={className}>
      <path
        ref={path}
        d={d}
        fill="none"
        stroke="var(--color-cta-3)"
        strokeWidth={weight}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="draw-stroke"
      />
    </svg>
  );
}
